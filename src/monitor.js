/**
 * XAUT Arbitrage Monitor
 * 主监控程序，定期查询价格并分析套利机会
 */

import OKXClient from './okx-client.js';
import DEXClient from './dex-client.js';
import ArbitrageCalculator from './arbitrage-calculator.js';
import { MONITOR_CONFIG, validateConfig } from './config.js';
import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';

class ArbitrageMonitor {
  constructor() {
    this.okx = new OKXClient();
    this.dex = new DEXClient();
    this.calculator = new ArbitrageCalculator();
    this.isRunning = false;
    this.dataDir = './data';
    
    // 统计数据
    this.stats = {
      totalChecks: 0,
      profitableOpportunities: 0,
      lastCheck: null,
      priceHistory: []
    };
  }

  /**
   * 初始化
   */
  async init() {
    console.log('🚀 初始化 XAUT 套利监控...\n');
    
    // 验证配置
    const configValid = validateConfig();
    if (!configValid) {
      console.log('⚠️  配置不完整，部分功能可能受限\n');
    }

    // 创建数据目录
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.warn('创建数据目录失败:', error.message);
    }

    console.log('✅ 初始化完成\n');
    console.log('配置信息:');
    console.log(`  检查间隔: ${MONITOR_CONFIG.CHECK_INTERVAL} 分钟`);
    console.log(`  最小价差: ${MONITOR_CONFIG.MIN_SPREAD_PERCENTAGE}%`);
    console.log(`  最小利润: $${MONITOR_CONFIG.MIN_PROFIT_USD}`);
    console.log(`  测试资金: ${MONITOR_CONFIG.TEST_CAPITAL_ETH} ETH\n`);
  }

  /**
   * 执行单次检查
   */
  async check() {
    console.log(`\n🔍 [${new Date().toLocaleString()}] 开始检查...`);
    
    try {
      // 并行获取 CEX 和 DEX 数据
      const [cexPrice, dexInfo] = await Promise.all([
        this.fetchCEXData(),
        this.fetchDEXData()
      ]);

      if (!cexPrice || !dexInfo) {
        console.log('❌ 数据获取失败，跳过本次检查');
        return;
      }

      // 分析套利机会
      const analysis = this.calculator.analyzeOpportunity(cexPrice, dexInfo);
      
      // 更新统计
      this.updateStats(analysis);
      
      // 显示结果
      const formatted = this.calculator.formatAnalysis(analysis);
      console.log(formatted);

      // 保存数据
      await this.saveData(analysis);

      // 如果有盈利机会，发送告警
      if (analysis.bestOpportunity) {
        await this.sendAlert(analysis);
      }

      this.stats.lastCheck = new Date().toISOString();
      
    } catch (error) {
      console.error('❌ 检查过程出错:', error.message);
    }
  }

  /**
   * 获取 CEX 数据
   */
  async fetchCEXData() {
    try {
      console.log('  📡 获取 OKX 数据...');
      
      const [price, orderBook, feeInfo] = await Promise.all([
        this.okx.getXAUTPrice(),
        this.okx.getOrderBook(20),
        this.okx.getTradingFee()
      ]);

      if (!price) {
        console.log('  ❌ 无法获取 OKX 价格');
        return null;
      }

      // 计算不同数量的成交均价
      const testAmounts = [0.1, 0.5, 1, 2, 5];
      const executionPrices = {};

      for (const amount of testAmounts) {
        const buyExec = this.okx.calculateAveragePrice(orderBook, amount, 'buy');
        const sellExec = this.okx.calculateAveragePrice(orderBook, amount, 'sell');
        
        executionPrices[amount] = {
          buy: buyExec,
          sell: sellExec
        };
      }

      console.log(`  ✅ OKX 价格: $${price.lastPrice.toFixed(2)}`);
      
      return {
        ...price,
        executionPrices,
        fee: feeInfo
      };
      
    } catch (error) {
      console.error('  ❌ 获取 CEX 数据失败:', error.message);
      return null;
    }
  }

  /**
   * 获取 DEX 数据
   */
  async fetchDEXData() {
    try {
      console.log('  ⛓️  获取链上数据...');
      
      const dexInfo = await this.dex.getFullDEXInfo(1); // 以 1 XAUT 为测试数量
      
      if (!dexInfo) {
        console.log('  ❌ 无法获取 DEX 数据');
        return null;
      }

      console.log(`  ✅ DEX 价格: $${dexInfo.xautPriceUSD.toFixed(2)}`);
      console.log(`  💧 DEX 流动性: $${(dexInfo.liquidity?.usd || 0).toFixed(2)}`);
      
      return dexInfo;
      
    } catch (error) {
      console.error('  ❌ 获取 DEX 数据失败:', error.message);
      return null;
    }
  }

  /**
   * 更新统计数据
   */
  updateStats(analysis) {
    this.stats.totalChecks++;
    
    if (analysis.bestOpportunity) {
      this.stats.profitableOpportunities++;
    }

    // 保存价格历史 (保留最近 100 条)
    this.stats.priceHistory.push({
      timestamp: analysis.timestamp,
      cexPrice: analysis.cex.price,
      dexPrice: analysis.dex.price,
      spread: analysis.priceGap.percentage
    });

    if (this.stats.priceHistory.length > 100) {
      this.stats.priceHistory.shift();
    }
  }

  /**
   * 保存数据到文件
   */
  async saveData(analysis) {
    try {
      const date = new Date().toISOString().split('T')[0];
      const filename = path.join(this.dataDir, `xaut-analysis-${date}.json`);
      
      // 读取现有数据
      let data = [];
      try {
        const existing = await fs.readFile(filename, 'utf8');
        data = JSON.parse(existing);
      } catch (error) {
        // 文件不存在，创建新数组
      }

      // 添加新数据
      data.push(analysis);

      // 保存
      await fs.writeFile(filename, JSON.stringify(data, null, 2));
      
    } catch (error) {
      console.warn('保存数据失败:', error.message);
    }
  }

  /**
   * 发送告警
   */
  async sendAlert(analysis) {
    const opp = analysis.bestOpportunity;
    
    console.log('\n🔔 发现套利机会!');
    console.log(`   方向: ${opp.direction}`);
    console.log(`   数量: ${opp.amount} XAUT`);
    console.log(`   预期利润: $${opp.profitUSD.toFixed(2)} (${opp.profitPercentage.toFixed(2)}%)`);
    
    // 这里可以集成 Telegram/Discord/邮件通知
    // 暂时只输出到控制台
  }

  /**
   * 显示统计信息
   */
  showStats() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 监控统计');
    console.log('='.repeat(60));
    console.log(`总检查次数: ${this.stats.totalChecks}`);
    console.log(`盈利机会数: ${this.stats.profitableOpportunities}`);
    console.log(`最后检查: ${this.stats.lastCheck ? new Date(this.stats.lastCheck).toLocaleString() : 'N/A'}`);
    
    if (this.stats.priceHistory.length > 0) {
      const spreads = this.stats.priceHistory.map(h => h.spread);
      const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
      const maxSpread = Math.max(...spreads);
      const minSpread = Math.min(...spreads);
      
      console.log(`\n价差统计 (最近 ${spreads.length} 次):`);
      console.log(`  平均: ${avgSpread.toFixed(2)}%`);
      console.log(`  最大: ${maxSpread.toFixed(2)}%`);
      console.log(`  最小: ${minSpread.toFixed(2)}%`);
    }
    
    console.log('='.repeat(60) + '\n');
  }

  /**
   * 启动监控
   */
  async start() {
    if (this.isRunning) {
      console.log('监控已在运行中');
      return;
    }

    await this.init();
    this.isRunning = true;

    console.log(`🟢 监控已启动，每 ${MONITOR_CONFIG.CHECK_INTERVAL} 分钟检查一次\n`);

    // 立即执行一次
    await this.check();

    // 定时执行
    const cronExpression = `*/${MONITOR_CONFIG.CHECK_INTERVAL} * * * *`;
    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.check();
    });

    // 每小时显示统计
    this.statsJob = cron.schedule('0 * * * *', () => {
      this.showStats();
    });

    // 处理退出
    process.on('SIGINT', () => {
      console.log('\n\n🛑 正在停止监控...');
      this.stop();
      process.exit(0);
    });
  }

  /**
   * 停止监控
   */
  stop() {
    this.isRunning = false;
    
    if (this.cronJob) {
      this.cronJob.stop();
    }
    
    if (this.statsJob) {
      this.statsJob.stop();
    }

    this.showStats();
    console.log('✅ 监控已停止');
  }

  /**
   * 运行单次检查 (用于测试)
   */
  async runOnce() {
    await this.init();
    await this.check();
    this.showStats();
  }
}

// 主程序
const monitor = new ArbitrageMonitor();

// 根据命令行参数决定运行模式
const args = process.argv.slice(2);

if (args.includes('--once')) {
  // 单次运行模式
  monitor.runOnce().catch(console.error);
} else {
  // 持续监控模式
  monitor.start().catch(console.error);
}

export default ArbitrageMonitor;
