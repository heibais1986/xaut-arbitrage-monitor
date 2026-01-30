/**
 * XAUT Arbitrage Monitor Configuration
 */

import dotenv from 'dotenv';
dotenv.config();

// Contract Addresses
export const CONTRACTS = {
  // XAUT Token (旧合约地址，已迁移)
  XAUT: {
    OLD: '0x4922a015c4407F87432B179bb209e125432E4a2A',
    // 注意: 需要确认新合约地址
    NEW: null
  },
  
  // WETH
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  
  // USDT
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  
  // Uniswap V2
  UNISWAP_V2: {
    FACTORY: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    ROUTER: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
  },
  
  // Uniswap V3
  UNISWAP_V3: {
    FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564'
  }
};

// ABIs
export const ABIS = {
  ERC20: [
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function balanceOf(address) view returns (uint256)',
    'function totalSupply() view returns (uint256)'
  ],
  
  UNISWAP_V2_PAIR: [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function totalSupply() view returns (uint256)'
  ],
  
  UNISWAP_V2_FACTORY: [
    'function getPair(address tokenA, address tokenB) view returns (address pair)'
  ],
  
  UNISWAP_V2_ROUTER: [
    'function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)',
    'function getAmountsIn(uint amountOut, address[] memory path) view returns (uint[] memory amounts)'
  ]
};

// OKX API Configuration
export const OKX_CONFIG = {
  BASE_URL: process.env.OKX_BASE_URL || 'https://www.okx.com',
  API_KEY: process.env.OKX_API_KEY,
  API_SECRET: process.env.OKX_API_SECRET,
  PASSPHRASE: process.env.OKX_PASSPHRASE
};

// Ethereum RPC
export const ETH_CONFIG = {
  RPC_URL: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'
};

// Monitoring Configuration
export const MONITOR_CONFIG = {
  // 检查间隔 (分钟)
  CHECK_INTERVAL: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 1,
  
  // 最小价差百分比 (触发告警)
  MIN_SPREAD_PERCENTAGE: parseFloat(process.env.MIN_SPREAD_PERCENTAGE) || 0.5,
  
  // 最小利润 USD
  MIN_PROFIT_USD: parseFloat(process.env.MIN_PROFIT_USD) || 10,
  
  // 测试资金规模 (ETH)
  TEST_CAPITAL_ETH: parseFloat(process.env.TEST_CAPITAL_ETH) || 1.5,
  
  // Gas 价格上限 (gwei)
  MAX_GAS_PRICE_GWEI: 50,
  
  // 滑点估算 (%)
  ESTIMATED_SLIPPAGE_PERCENT: 1.0
};

// Telegram Configuration (可选)
export const TELEGRAM_CONFIG = {
  BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  CHAT_ID: process.env.TELEGRAM_CHAT_ID
};

// 验证配置
export function validateConfig() {
  const missing = [];
  
  if (!OKX_CONFIG.API_KEY) missing.push('OKX_API_KEY');
  if (!OKX_CONFIG.API_SECRET) missing.push('OKX_API_SECRET');
  if (!OKX_CONFIG.PASSPHRASE) missing.push('OKX_PASSPHRASE');
  if (!ETH_CONFIG.RPC_URL) missing.push('ETH_RPC_URL');
  
  if (missing.length > 0) {
    console.warn('⚠️  缺少以下配置项 (将使用默认值或受限功能):', missing.join(', '));
    return false;
  }
  
  return true;
}
