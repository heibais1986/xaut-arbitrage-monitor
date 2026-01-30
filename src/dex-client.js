/**
 * DEX (Uniswap) Client
 * 用于获取链上 DEX 的 XAUT 价格和流动性数据
 */

import { ethers } from 'ethers';
import { CONTRACTS, ABIS, ETH_CONFIG } from './config.js';

class DEXClient {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(ETH_CONFIG.RPC_URL);
    this.xautAddress = CONTRACTS.XAUT.OLD; // 使用旧合约地址
    this.wethAddress = CONTRACTS.WETH;
    this.usdtAddress = CONTRACTS.USDT;
  }

  /**
   * 获取 Uniswap V2 Pair 地址
   */
  async getUniswapV2Pair(tokenA, tokenB) {
    const factory = new ethers.Contract(
      CONTRACTS.UNISWAP_V2.FACTORY,
      ABIS.UNISWAP_V2_FACTORY,
      this.provider
    );
    return await factory.getPair(tokenA, tokenB);
  }

  /**
   * 获取 Uniswap V2 池子信息
   */
  async getUniswapV2PoolInfo(pairAddress) {
    try {
      const pair = new ethers.Contract(
        pairAddress,
        ABIS.UNISWAP_V2_PAIR,
        this.provider
      );

      const [token0, token1, reserves] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves()
      ]);

      // 获取代币精度
      const token0Contract = new ethers.Contract(token0, ABIS.ERC20, this.provider);
      const token1Contract = new ethers.Contract(token1, ABIS.ERC20, this.provider);
      
      const [decimals0, decimals1, symbol0, symbol1] = await Promise.all([
        token0Contract.decimals(),
        token1Contract.decimals(),
        token0Contract.symbol(),
        token1Contract.symbol()
      ]);

      // 计算价格
      const reserve0 = parseFloat(ethers.formatUnits(reserves.reserve0, decimals0));
      const reserve1 = parseFloat(ethers.formatUnits(reserves.reserve1, decimals1));

      // 确定哪个是 XAUT
      const isToken0XAUT = token0.toLowerCase() === this.xautAddress.toLowerCase();
      
      let xautPriceInWETH;
      let xautReserve;
      let wethReserve;

      if (isToken0XAUT) {
        xautPriceInWETH = reserve1 / reserve0;
        xautReserve = reserve0;
        wethReserve = reserve1;
      } else {
        xautPriceInWETH = reserve0 / reserve1;
        xautReserve = reserve1;
        wethReserve = reserve0;
      }

      return {
        pairAddress,
        token0: { address: token0, symbol: symbol0, decimals: decimals0 },
        token1: { address: token1, symbol: symbol1, decimals: decimals1 },
        reserves: {
          reserve0: reserve0,
          reserve1: reserve1
        },
        xautPriceInWETH,
        xautReserve,
        wethReserve,
        totalLiquidityUSD: null, // 需要 ETH 价格才能计算
        isToken0XAUT
      };
    } catch (error) {
      console.error('获取 V2 池子信息失败:', error.message);
      return null;
    }
  }

  /**
   * 使用 Uniswap V2 Router 计算交换数量
   */
  async calculateSwapOutput(amountIn, path) {
    try {
      const router = new ethers.Contract(
        CONTRACTS.UNISWAP_V2.ROUTER,
        ABIS.UNISWAP_V2_ROUTER,
        this.provider
      );

      const amountsOut = await router.getAmountsOut(amountIn, path);
      return amountsOut.map(a => a.toString());
    } catch (error) {
      console.error('计算交换输出失败:', error.message);
      return null;
    }
  }

  /**
   * 计算 DEX 上的 XAUT 价格 (通过 WETH)
   */
  async getXAUTPriceInWETH() {
    try {
      const pairAddress = await this.getUniswapV2Pair(this.xautAddress, this.wethAddress);
      
      if (pairAddress === ethers.ZeroAddress) {
        console.warn('未找到 XAUT/WETH 交易对');
        return null;
      }

      console.log(`✓ 找到 XAUT/WETH 池子: ${pairAddress}`);
      
      const poolInfo = await this.getUniswapV2PoolInfo(pairAddress);
      return poolInfo;
    } catch (error) {
      console.error('获取 XAUT 价格失败:', error.message);
      return null;
    }
  }

  /**
   * 获取 ETH/USDT 价格 (用于计算 USD 价格)
   */
  async getETHPriceInUSDT() {
    try {
      const pairAddress = await this.getUniswapV2Pair(this.wethAddress, this.usdtAddress);
      
      if (pairAddress === ethers.ZeroAddress) {
        console.warn('未找到 WETH/USDT 交易对');
        return null;
      }

      const pair = new ethers.Contract(
        pairAddress,
        ABIS.UNISWAP_V2_PAIR,
        this.provider
      );

      const [token0, reserves] = await Promise.all([
        pair.token0(),
        pair.getReserves()
      ]);

      // USDT 是 6 位小数
      const usdtDecimals = 6;
      const wethDecimals = 18;

      const reserve0 = parseFloat(ethers.formatUnits(reserves.reserve0, token0.toLowerCase() === this.usdtAddress.toLowerCase() ? usdtDecimals : wethDecimals));
      const reserve1 = parseFloat(ethers.formatUnits(reserves.reserve1, token0.toLowerCase() === this.usdtAddress.toLowerCase() ? wethDecimals : usdtDecimals));

      // 计算 1 ETH = ? USDT
      const isToken0USDT = token0.toLowerCase() === this.usdtAddress.toLowerCase();
      const ethPrice = isToken0USDT ? reserve0 / reserve1 : reserve1 / reserve0;

      return {
        price: ethPrice,
        pairAddress,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('获取 ETH 价格失败:', error.message);
      return null;
    }
  }

  /**
   * 计算特定数量 XAUT 的 DEX 成交价格和滑点
   */
  async calculateDEXExecution(xautAmount, isBuy = true) {
    try {
      const poolInfo = await this.getXAUTPriceInWETH();
      if (!poolInfo) return null;

      const { xautPriceInWETH, xautReserve, wethReserve, isToken0XAUT } = poolInfo;

      // 使用常数乘积公式计算
      // k = x * y
      const k = xautReserve * wethReserve;
      
      let newXautReserve;
      let newWethReserve;
      let wethAmount;

      if (isBuy) {
        // 买入 XAUT: 用 WETH 换 XAUT
        newXautReserve = xautReserve - xautAmount;
        if (newXautReserve <= 0) {
          console.warn('⚠️  池子 XAUT 不足');
          return null;
        }
        newWethReserve = k / newXautReserve;
        wethAmount = newWethReserve - wethReserve;
      } else {
        // 卖出 XAUT: 用 XAUT 换 WETH
        newXautReserve = xautReserve + xautAmount;
        newWethReserve = k / newXautReserve;
        wethAmount = wethReserve - newWethReserve;
      }

      // 计算实际成交价格
      const executionPrice = wethAmount / xautAmount;
      
      // 计算滑点
      const slippage = Math.abs((executionPrice - xautPriceInWETH) / xautPriceInWETH) * 100;

      // 计算价格影响 (池子深度)
      const priceImpact = (xautAmount / xautReserve) * 100;

      return {
        xautAmount,
        wethAmount,
        executionPrice,
        spotPrice: xautPriceInWETH,
        slippage,
        priceImpact,
        remainingLiquidity: {
          xaut: newXautReserve,
          weth: newWethReserve
        }
      };
    } catch (error) {
      console.error('计算 DEX 成交失败:', error.message);
      return null;
    }
  }

  /**
   * 获取完整的 DEX 价格信息
   */
  async getFullDEXInfo(testAmount = 1) {
    console.log('🔍 正在查询 DEX 数据...');
    
    const [poolInfo, ethPrice] = await Promise.all([
      this.getXAUTPriceInWETH(),
      this.getETHPriceInUSDT()
    ]);

    if (!poolInfo || !ethPrice) {
      console.error('❌ 无法获取完整的 DEX 信息');
      return null;
    }

    // 计算 XAUT 的 USD 价格
    const xautPriceUSD = poolInfo.xautPriceInWETH * ethPrice.price;

    // 计算测试数量的成交情况
    const buyExecution = await this.calculateDEXExecution(testAmount, true);
    const sellExecution = await this.calculateDEXExecution(testAmount, false);

    // 计算流动性 USD 价值
    const liquidityUSD = poolInfo.wethReserve * ethPrice.price * 2; // 近似计算

    return {
      timestamp: new Date().toISOString(),
      xautPriceInWETH: poolInfo.xautPriceInWETH,
      xautPriceUSD,
      ethPriceUSD: ethPrice.price,
      poolAddress: poolInfo.pairAddress,
      liquidity: {
        xaut: poolInfo.xautReserve,
        weth: poolInfo.wethReserve,
        usd: liquidityUSD
      },
      execution: {
        testAmount,
        buy: buyExecution ? {
          wethCost: buyExecution.wethAmount,
          usdCost: buyExecution.wethAmount * ethPrice.price,
          slippage: buyExecution.slippage,
          priceImpact: buyExecution.priceImpact
        } : null,
        sell: sellExecution ? {
          wethReceived: sellExecution.wethAmount,
          usdReceived: sellExecution.wethAmount * ethPrice.price,
          slippage: sellExecution.slippage,
          priceImpact: sellExecution.priceImpact
        } : null
      }
    };
  }

  /**
   * 获取当前 Gas 价格
   */
  async getGasPrice() {
    try {
      const feeData = await this.provider.getFeeData();
      return {
        gasPrice: feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : null,
        maxFeePerGas: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') : null,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') : null
      };
    } catch (error) {
      console.error('获取 Gas 价格失败:', error.message);
      return null;
    }
  }
}

export default DEXClient;
