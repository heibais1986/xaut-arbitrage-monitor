/**
 * Test Script
 * 用于测试各个模块的功能
 */

import OKXClient from './okx-client.js';
import DEXClient from './dex-client.js';
import ArbitrageCalculator from './arbitrage-calculator.js';
import { validateConfig } from './config.js';

async function testOKX() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 测试 OKX API');
  console.log('='.repeat(60) + '\n');

  const client = new OKXClient();

  try {
    // 测试获取价格
    console.log('1. 获取 XAUT 价格...');
    const price = await client.getXAUTPrice();
    if (price) {
      console.log('✅ 价格获取成功:');
      console.log(`   最新价: $${price.lastPrice}`);
      console.log(`   买一价: $${price.bidPrice}`);
      console.log(`   卖一价: $${price.askPrice}`);
      console.log(`   24h 成交量: ${price.volume24h} XAUT`);
    } else {
      console.log('❌ 价格获取失败');
    }

    // 测试获取订单簿
    console.log('\n2. 获取订单簿...');
    const orderBook = await client.getOrderBook(10);
    if (orderBook) {
      console.log('✅ 订单簿获取成功:');
      console.log(`   买单数量: ${orderBook.bids.length}`);
      console.log(`   卖单数量: ${orderBook.asks.length}`);
      console.log(`   最佳买价: $${orderBook.bids[0]?.price}`);
      console.log(`   最佳卖价: $${orderBook.asks[0]?.price}`);
    } else {
      console.log('❌ 订单簿获取失败');
    }

    // 测试计算成交均价
    if (orderBook) {
      console.log('\n3. 计算成交均价 (1 XAUT)...');
      const buyExec = client.calculateAveragePrice(orderBook, 1, 'buy');
      const sellExec = client.calculateAveragePrice(orderBook, 1, 'sell');
      
      if (buyExec) {
        console.log('✅ 买入执行:');
        console.log(`   成交均价: $${buyExec.averagePrice.toFixed(2)}`);
        console.log(`   总成本: $${buyExec.totalCost.toFixed(2)}`);
        console.log(`   滑点: ${buyExec.slippage.toFixed(4)}%`);
      }
      
      if (sellExec) {
        console.log('✅ 卖出执行:');
        console.log(`   成交均价: $${sellExec.averagePrice.toFixed(2)}`);
        console.log(`   总收入: $${sellExec.totalCost.toFixed(2)}`);
        console.log(`   滑点: ${sellExec.slippage.toFixed(4)}%`);
      }
    }

    // 测试获取提现信息
    console.log('\n4. 获取提现信息...');
    const withdrawInfo = await client.getWithdrawalInfo();
    if (withdrawInfo) {
      console.log('✅ 提现信息获取成功:');
      console.log(`   最小提现: ${withdrawInfo.minWithdrawal} XAUT`);
      console.log(`   最大提现: ${withdrawInfo.maxWithdrawal} XAUT`);
      console.log(`   提现费: ${withdrawInfo.fee} XAUT`);
      console.log(`   可提现: ${withdrawInfo.canWithdraw ? '是' : '否'}`);
    } else {
      console.log('❌ 提现信息获取失败 (可能需要 API 权限)');
    }

  } catch (error) {
    console.error('❌ OKX 测试失败:', error.message);
  }
}

async function testDEX() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 测试 DEX (Uniswap)');
  console.log('='.repeat(60) + '\n');

  const client = new DEXClient();

  try {
    // 测试获取 Gas 价格
    console.log('1. 获取 Gas 价格...');
    const gasPrice = await client.getGasPrice();
    if (gasPrice) {
      console.log('✅ Gas 价格获取成功:');
      console.log(`   Gas Price: ${gasPrice.gasPrice} gwei`);
      if (gasPrice.maxFeePerGas) {
        console.log(`   Max Fee: ${gasPrice.maxFeePerGas} gwei`);
        console.log(`   Priority Fee: ${gasPrice.maxPriorityFeePerGas} gwei`);
      }
    } else {
      console.log('❌ Gas 价格获取失败');
    }

    // 测试获取 ETH 价格
    console.log('\n2. 获取 ETH/USDT 价格...');
    const ethPrice = await client.getETHPriceInUSDT();
    if (ethPrice) {
      console.log('✅ ETH 价格获取成功:');
      console.log(`   1 ETH = $${ethPrice.price.toFixed(2)} USDT`);
    } else {
      console.log('❌ ETH 价格获取失败');
    }

    // 测试获取 XAUT 池子信息
    console.log('\n3. 获取 XAUT/WETH 池子信息...');
    const poolInfo = await client.getXAUTPriceInWETH();
    if (poolInfo) {
      console.log('✅ 池子信息获取成功:');
      console.log(`   池子地址: ${poolInfo.pairAddress}`);
      console.log(`   XAUT 价格 (WETH): ${poolInfo.xautPriceInWETH.toFixed(6)} WETH`);
      console.log(`   XAUT 储备: ${poolInfo.xautReserve.toFixed(4)} XAUT`);
      console.log(`   WETH 储备: ${poolInfo.wethReserve.toFixed(4)} WETH`);
      
      if (ethPrice) {
        const xautPriceUSD = poolInfo.xautPriceInWETH * ethPrice.price;
        console.log(`   XAUT 价格 (USD): $${xautPriceUSD.toFixed(2)}`);
      }
    } else {
      console.log('❌ 池子信息获取失败');
    }

    // 测试计算成交
    if (poolInfo) {
      console.log('\n4. 计算 DEX 成交 (1 XAUT)...');
      
      const buyExecution = await client.calculateDEXExecution(1, true);
      if (buyExecution) {
        console.log('✅ 买入执行:');
        console.log(`   需要 WETH: ${buyExecution.wethAmount.toFixed(6)}`);
        console.log(`   执行价格: ${buyExecution.executionPrice.toFixed(6)} WETH`);
        console.log(`   滑点: ${buyExecution.slippage.toFixed(4)}%`);
        console.log(`   价格影响: ${buyExecution.priceImpact.toFixed(4)}%`);
      }

      const sellExecution = await client.calculateDEXExecution(1, false);
      if (sellExecution) {
        console.log('✅ 卖出执行:');
        console.log(`   获得 WETH: ${sellExecution.wethAmount.toFixed(6)}`);
        console.log(`   执行价格: ${sellExecution.executionPrice.toFixed(6)} WETH`);
        console.log(`   滑点: ${sellExecution.slippage.toFixed(4)}%`);
        console.log(`   价格影响: ${sellExecution.priceImpact.toFixed(4)}%`);
      }
    }

    // 测试获取完整 DEX 信息
    console.log('\n5. 获取完整 DEX 信息...');
    const fullInfo = await client.getFullDEXInfo(1);
    if (fullInfo) {
      console.log('✅ 完整信息获取成功:');
      console.log(`   XAUT 价格: $${fullInfo.xautPriceUSD.toFixed(2)}`);
      console.log(`   池子流动性: $${(fullInfo.liquidity?.usd || 0).toFixed(2)}`);
    } else {
      console.log('❌ 完整信息获取失败');
    }

  } catch (error) {
    console.error('❌ DEX 测试失败:', error.message);
    console.error(error.stack);
  }
}

async function testCalculator() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 测试套利计算器');
  console.log('='.repeat(60) + '\n');

  const calculator = new ArbitrageCalculator();

  // 模拟数据
  const mockCexPrice = {
    lastPrice: 5344.10,
    bidPrice: 5343.50,
    askPrice: 5344.70,
    bidVolume: 100,
    askVolume: 100,
    volume24h: 1000000
  };

  const mockDexInfo = {
    xautPriceInWETH: 1.8,
    xautPriceUSD: 5040.00,
    ethPriceUSD: 2800,
    liquidity: {
      xaut: 15,
      weth: 27,
      usd: 84000
    },
    execution: {
      testAmount: 1,
      buy: {
        wethCost: 1.82,
        usdCost: 5096.00,
        slippage: 1.11,
        priceImpact: 6.67
      },
      sell: {
        wethReceived: 1.78,
        usdReceived: 4984.00,
        slippage: 1.11,
        priceImpact: 6.67
      }
    }
  };

  try {
    console.log('模拟数据:');
    console.log(`  CEX 价格: $${mockCexPrice.lastPrice}`);
    console.log(`  DEX 价格: $${mockDexInfo.xautPriceUSD}`);
    console.log(`  价差: ${((mockCexPrice.lastPrice - mockDexInfo.xautPriceUSD) / mockDexInfo.xautPriceUSD * 100).toFixed(2)}%\n`);

    console.log('1. 测试 CEX -> DEX 计算...');
    const cexToDex = calculator.calculateCEXtoDEX(mockCexPrice, mockDexInfo, 1);
    if (cexToDex) {
      console.log('✅ 计算结果:');
      console.log(`   方向: ${cexToDex.direction}`);
      console.log(`   预期利润: $${cexToDex.profitUSD.toFixed(2)} (${cexToDex.profitPercentage.toFixed(2)}%)`);
      console.log(`   是否可盈利: ${cexToDex.isProfitable ? '是' : '否'}`);
      
      if (cexToDex.risks.length > 0) {
        console.log('   风险:');
        cexToDex.risks.forEach(risk => {
          console.log(`     [${risk.level}] ${risk.message}`);
        });
      }
    }

    console.log('\n2. 测试 DEX -> CEX 计算...');
    const dexToCex = calculator.calculateDEXtoCEX(mockCexPrice, mockDexInfo, 1);
    if (dexToCex) {
      console.log('✅ 计算结果:');
      console.log(`   方向: ${dexToCex.direction}`);
      console.log(`   预期利润: $${dexToCex.profitUSD.toFixed(2)} (${dexToCex.profitPercentage.toFixed(2)}%)`);
      console.log(`   是否可盈利: ${dexToCex.isProfitable ? '是' : '否'}`);
    }

    console.log('\n3. 测试完整分析...');
    const analysis = calculator.analyzeOpportunity(mockCexPrice, mockDexInfo);
    const formatted = calculator.formatAnalysis(analysis);
    console.log(formatted);

  } catch (error) {
    console.error('❌ 计算器测试失败:', error.message);
  }
}

async function runAllTests() {
  console.log('\n' + '🎬'.repeat(30));
  console.log('XAUT 套利监控系统 - 功能测试');
  console.log('🎬'.repeat(30));

  // 验证配置
  console.log('\n📋 配置验证:');
  const configValid = validateConfig();
  if (!configValid) {
    console.log('⚠️  配置不完整，部分测试可能失败');
    console.log('   请确保已设置 OKX API 和 ETH_RPC_URL\n');
  } else {
    console.log('✅ 配置验证通过\n');
  }

  // 运行测试
  await testOKX();
  await testDEX();
  await testCalculator();

  console.log('\n' + '='.repeat(60));
  console.log('✅ 所有测试完成');
  console.log('='.repeat(60) + '\n');
}

// 运行测试
runAllTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
