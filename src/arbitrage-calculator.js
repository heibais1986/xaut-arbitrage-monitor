/**
 * Arbitrage Calculator
 * 计算套利机会和预期收益
 */

import { MONITOR_CONFIG } from './config.js';

class ArbitrageCalculator {
  constructor() {
    this.minSpreadPercentage = MONITOR_CONFIG.MIN_SPREAD_PERCENTAGE;
    this.minProfitUSD = MONITOR_CONFIG.MIN_PROFIT_USD;
    this.testCapitalETH = MONITOR_CONFIG.TEST_CAPITAL_ETH;
    this.estimatedSlippage = MONITOR_CONFIG.ESTIMATED_SLIPPAGE_PERCENT;
  }

  /**
   * 计算 CEX -> DEX 套利 (在 CEX 买，在 DEX 卖)
   */
  calculateCEXtoDEX(cexPrice, dexInfo, amount) {
    if (!cexPrice || !dexInfo) return null;

    const { execution } = dexInfo;
    
    // 在 DEX 卖出 XAUT 能收到的 WETH
    const dexSellExecution = execution?.sell;
    if (!dexSellExecution) {
      return { error: '无法获取 DEX 卖出执行数据' };
    }

    // 成本计算
    const costs = this.calculateCosts(cexPrice, dexInfo, amount, 'CEXtoDEX');

    // 收入计算 (DEX 卖出)
    const revenueUSD = dexSellExecution.usdReceived;

    // 利润计算
    const profitUSD = revenueUSD - costs.totalCostUSD;
    const profitPercentage = (profitUSD / costs.totalCostUSD) * 100;

    return {
      direction: 'CEX → DEX',
      amount,
      cexPrice: cexPrice.lastPrice,
      dexPrice: dexInfo.xautPriceUSD,
      costs,
      revenueUSD,
      profitUSD,
      profitPercentage,
      isProfitable: profitUSD > this.minProfitUSD && profitPercentage > this.minSpreadPercentage,
      risks: this.assessRisks(dexInfo, amount, dexSellExecution.priceImpact)
    };
  }

  /**
   * 计算 DEX -> CEX 套利 (在 DEX 买，在 CEX 卖)
   */
  calculateDEXtoCEX(cexPrice, dexInfo, amount) {
    if (!cexPrice || !dexInfo) return null;

    const { execution } = dexInfo;
    
    // 在 DEX 买入 XAUT 需要支付的 WETH
    const dexBuyExecution = execution?.buy;
    if (!dexBuyExecution) {
      return { error: '无法获取 DEX 买入执行数据' };
    }

    // 成本计算
    const costs = this.calculateCosts(cexPrice, dexInfo, amount, 'DEXtoCEX');

    // 收入计算 (CEX 卖出)
    // 假设以买一价卖出
    const revenueUSD = amount * cexPrice.bidPrice * (1 - 0.001); // 扣除 0.1% 手续费

    // 利润计算
    const profitUSD = revenueUSD - costs.totalCostUSD;
    const profitPercentage = (profitUSD / costs.totalCostUSD) * 100;

    return {
      direction: 'DEX → CEX',
      amount,
      cexPrice: cexPrice.lastPrice,
      dexPrice: dexInfo.xautPriceUSD,
      costs,
      revenueUSD,
      profitUSD,
      profitPercentage,
      isProfitable: profitUSD > this.minProfitUSD && profitPercentage > this.minSpreadPercentage,
      risks: this.assessRisks(dexInfo, amount, dexBuyExecution.priceImpact)
    };
  }

  /**
   * 计算成本明细
   */
  calculateCosts(cexPrice, dexInfo, amount, direction) {
    const costs = {
      tradingFees: 0,
      gasFees: 0,
      withdrawalFees: 0,
      slippageCost: 0,
      totalCostUSD: 0
    };

    // CEX 交易费 (0.1% Taker)
    const cexTradingFeeRate = 0.001;
    
    // DEX 手续费 (0.3% Uniswap V2)
    const dexTradingFeeRate = 0.003;

    if (direction === 'CEXtoDEX') {
      // CEX 买入成本
      const cexBuyCost = amount * cexPrice.askPrice;
      costs.tradingFees = cexBuyCost * cexTradingFeeRate;
      
      // 提现费 (假设 0.005 XAUT)
      costs.withdrawalFees = 0.005 * cexPrice.lastPrice;
      
      // DEX 卖出滑点成本
      const dexSellSlippage = dexInfo.execution?.sell?.slippage || 0;
      costs.slippageCost = cexBuyCost * (dexSellSlippage / 100);
      
      costs.totalCostUSD = cexBuyCost + costs.tradingFees + costs.withdrawalFees;
      
    } else {
      // DEX 买入成本
      const dexBuyCost = dexInfo.execution?.buy?.usdCost || 0;
      costs.tradingFees = dexBuyCost * dexTradingFeeRate;
      
      // Gas 费估算 (假设 $20)
      costs.gasFees = 20;
      
      // DEX 买入滑点成本
      const dexBuySlippage = dexInfo.execution?.buy?.slippage || 0;
      costs.slippageCost = dexBuyCost * (dexBuySlippage / 100);
      
      costs.totalCostUSD = dexBuyCost + costs.tradingFees + costs.gasFees;
    }

    return costs;
  }

  /**
   * 风险评估
   */
  assessRisks(dexInfo, amount, priceImpact) {
    const risks = [];

    // 流动性风险
    const liquidityUSD = dexInfo.liquidity?.usd || 0;
    const amountUSD = amount * dexInfo.xautPriceUSD;
    
    if (amountUSD > liquidityUSD * 0.1) {
      risks.push({
        level: 'HIGH',
        type: 'LIQUIDITY',
        message: `交易金额 (${amountUSD.toFixed(2)} USD) 超过池子流动性 (${liquidityUSD.toFixed(2)} USD) 的 10%`
      });
    }

    // 价格影响风险
    if (priceImpact > 5) {
      risks.push({
        level: 'HIGH',
        type: 'PRICE_IMPACT',
        message: `价格影响过高: ${priceImpact.toFixed(2)}%`
      });
    } else if (priceImpact > 2) {
      risks.push({
        level: 'MEDIUM',
        type: 'PRICE_IMPACT',
        message: `价格影响中等: ${priceImpact.toFixed(2)}%`
      });
    }

    // 滑点风险
    if (dexInfo.execution?.buy?.slippage > 3 || dexInfo.execution?.sell?.slippage > 3) {
      risks.push({
        level: 'MEDIUM',
        type: 'SLIPPAGE',
        message: 'DEX 滑点较高，实际成交价可能与预期有较大偏差'
      });
    }

    // 流动性过低警告
    if (liquidityUSD < 100000) {
      risks.push({
        level: 'HIGH',
        type: 'LOW_LIQUIDITY',
        message: `池子流动性过低 (${liquidityUSD.toFixed(2)} USD)，不适合大额交易`
      });
    }

    return risks;
  }

  /**
   * 综合分析套利机会
   */
  analyzeOpportunity(cexPrice, dexInfo) {
    if (!cexPrice || !dexInfo) {
      return { error: '缺少必要的价格数据' };
    }

    const results = {
      timestamp: new Date().toISOString(),
      cex: {
        price: cexPrice.lastPrice,
        bid: cexPrice.bidPrice,
        ask: cexPrice.askPrice,
        spread: ((cexPrice.askPrice - cexPrice.bidPrice) / cexPrice.lastPrice) * 100
      },
      dex: {
        price: dexInfo.xautPriceUSD,
        liquidity: dexInfo.liquidity?.usd,
        priceInWETH: dexInfo.xautPriceInWETH
      },
      priceGap: {
        absolute: cexPrice.lastPrice - dexInfo.xautPriceUSD,
        percentage: ((cexPrice.lastPrice - dexInfo.xautPriceUSD) / dexInfo.xautPriceUSD) * 100
      },
      opportunities: []
    };

    // 测试不同数量的套利机会
    const testAmounts = [0.1, 0.5, 1, 2, 5];
    
    for (const amount of testAmounts) {
      // CEX -> DEX
      const cexToDex = this.calculateCEXtoDEX(cexPrice, dexInfo, amount);
      if (cexToDex && !cexToDex.error) {
        results.opportunities.push(cexToDex);
      }

      // DEX -> CEX
      const dexToCex = this.calculateDEXtoCEX(cexPrice, dexInfo, amount);
      if (dexToCex && !dexToCex.error) {
        results.opportunities.push(dexToCex);
      }
    }

    // 找出最有利可图的机会
    const profitableOpps = results.opportunities.filter(o => o.isProfitable);
    results.bestOpportunity = profitableOpps.length > 0 
      ? profitableOpps.reduce((best, current) => current.profitUSD > best.profitUSD ? current : best)
      : null;

    return results;
  }

  /**
   * 格式化输出分析结果
   */
  formatAnalysis(analysis) {
    if (analysis.error) {
      return `❌ 分析失败: ${analysis.error}`;
    }

    let output = '\n' + '='.repeat(60) + '\n';
    output += `📊 XAUT 套利分析 - ${new Date(analysis.timestamp).toLocaleString()}\n`;
    output += '='.repeat(60) + '\n\n';

    // 价格对比
    output += '💰 价格对比:\n';
    output += `   CEX (OKX): $${analysis.cex.price.toFixed(2)}\n`;
    output += `   DEX (Uniswap): $${analysis.dex.price.toFixed(2)}\n`;
    output += `   价差: ${analysis.priceGap.percentage.toFixed(2)}%\n\n`;

    // DEX 流动性
    output += '💧 DEX 流动性:\n';
    output += `   池子总价值: $${(analysis.dex.liquidity || 0).toFixed(2)}\n`;
    output += `   XAUT 储备: ${(analysis.dex.liquidity / analysis.dex.price / 2 || 0).toFixed(4)} XAUT\n\n`;

    // 套利机会
    if (analysis.opportunities.length > 0) {
      output += '📈 套利机会分析:\n';
      
      for (const opp of analysis.opportunities) {
        const emoji = opp.isProfitable ? '✅' : '❌';
        output += `\n   ${emoji} ${opp.direction} (${opp.amount} XAUT)\n`;
        output += `      预期利润: $${opp.profitUSD.toFixed(2)} (${opp.profitPercentage.toFixed(2)}%)\n`;
        output += `      总成本: $${opp.costs.totalCostUSD.toFixed(2)}\n`;
        
        if (opp.risks.length > 0) {
          output += `      风险警告:\n`;
          for (const risk of opp.risks) {
            const riskEmoji = risk.level === 'HIGH' ? '🔴' : '🟡';
            output += `        ${riskEmoji} ${risk.message}\n`;
          }
        }
      }
    }

    // 最佳机会
    if (analysis.bestOpportunity) {
      output += '\n🏆 最佳机会:\n';
      output += `   方向: ${analysis.bestOpportunity.direction}\n`;
      output += `   数量: ${analysis.bestOpportunity.amount} XAUT\n`;
      output += `   预期净利润: $${analysis.bestOpportunity.profitUSD.toFixed(2)}\n`;
    } else {
      output += '\n⚠️  当前没有满足条件的套利机会\n';
    }

    output += '\n' + '='.repeat(60) + '\n';
    return output;
  }
}

export default ArbitrageCalculator;
