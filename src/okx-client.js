/**
 * OKX API Client
 * 用于获取 CEX 上的 XAUT 价格和交易数据
 */

import axios from 'axios';
import crypto from 'crypto';
import { OKX_CONFIG } from './config.js';

class OKXClient {
  constructor() {
    this.baseURL = OKX_CONFIG.BASE_URL;
    this.apiKey = OKX_CONFIG.API_KEY;
    this.apiSecret = OKX_CONFIG.API_SECRET;
    this.passphrase = OKX_CONFIG.PASSPHRASE;
  }

  /**
   * 生成 OKX API 签名
   */
  generateSignature(timestamp, method, path, body = '') {
    const message = timestamp + method.toUpperCase() + path + body;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('base64');
    return signature;
  }

  /**
   * 发送带签名的请求
   */
  async request(method, path, params = null, body = null) {
    const timestamp = new Date().toISOString();
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    const fullPath = path + queryString;
    const bodyString = body ? JSON.stringify(body) : '';

    const headers = {
      'OK-ACCESS-KEY': this.apiKey,
      'OK-ACCESS-SIGN': this.generateSignature(timestamp, method, fullPath, bodyString),
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.passphrase,
      'Content-Type': 'application/json'
    };

    try {
      const response = await axios({
        method,
        url: `${this.baseURL}${fullPath}`,
        headers,
        data: body || undefined
      });
      return response.data;
    } catch (error) {
      console.error('OKX API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 获取 XAUT/USDT 当前价格
   */
  async getXAUTPrice() {
    try {
      const data = await this.request('GET', '/api/v5/market/ticker', {
        instId: 'XAUT-USDT'
      });
      
      if (data.code !== '0') {
        throw new Error(`OKX API Error: ${data.msg}`);
      }

      const ticker = data.data[0];
      return {
        symbol: 'XAUT-USDT',
        lastPrice: parseFloat(ticker.last),
        bidPrice: parseFloat(ticker.bidPx),
        askPrice: parseFloat(ticker.askPx),
        bidVolume: parseFloat(ticker.bidSz),
        askVolume: parseFloat(ticker.askSz),
        volume24h: parseFloat(ticker.vol24h),
        high24h: parseFloat(ticker.high24h),
        low24h: parseFloat(ticker.low24h),
        timestamp: new Date(ticker.ts).toISOString()
      };
    } catch (error) {
      console.error('获取 XAUT 价格失败:', error.message);
      return null;
    }
  }

  /**
   * 获取 XAUT/USDT 订单簿深度
   */
  async getOrderBook(depth = 20) {
    try {
      const data = await this.request('GET', '/api/v5/market/books', {
        instId: 'XAUT-USDT',
        sz: depth.toString()
      });

      if (data.code !== '0') {
        throw new Error(`OKX API Error: ${data.msg}`);
      }

      const book = data.data[0];
      return {
        bids: book.bids.map(b => ({
          price: parseFloat(b[0]),
          volume: parseFloat(b[1]),
          orderCount: parseInt(b[2])
        })),
        asks: book.asks.map(a => ({
          price: parseFloat(a[0]),
          volume: parseFloat(a[1]),
          orderCount: parseInt(a[2])
        })),
        timestamp: new Date(book.ts).toISOString()
      };
    } catch (error) {
      console.error('获取订单簿失败:', error.message);
      return null;
    }
  }

  /**
   * 计算特定数量 XAUT 的成交均价
   */
  calculateAveragePrice(orderBook, amount, side = 'buy') {
    if (!orderBook) return null;

    const orders = side === 'buy' ? orderBook.asks : orderBook.bids;
    let remaining = amount;
    let totalCost = 0;
    let totalVolume = 0;

    for (const order of orders) {
      if (remaining <= 0) break;
      
      const fillVolume = Math.min(remaining, order.volume);
      totalCost += fillVolume * order.price;
      totalVolume += fillVolume;
      remaining -= fillVolume;
    }

    if (remaining > 0) {
      console.warn(`⚠️  订单簿深度不足，无法完全成交 ${amount} XAUT`);
      return null;
    }

    return {
      averagePrice: totalCost / totalVolume,
      totalCost,
      totalVolume,
      slippage: this.calculateSlippage(orders[0].price, totalCost / totalVolume, side)
    };
  }

  /**
   * 计算滑点
   */
  calculateSlippage(bestPrice, averagePrice, side) {
    if (side === 'buy') {
      return ((averagePrice - bestPrice) / bestPrice) * 100;
    } else {
      return ((bestPrice - averagePrice) / bestPrice) * 100;
    }
  }

  /**
   * 获取交易手续费率
   */
  async getTradingFee() {
    // OKX 现货交易手续费 (Maker/Taker)
    // 普通用户: Maker 0.08%, Taker 0.1%
    // 这里返回默认值，实际可以通过 API 获取
    return {
      maker: 0.0008,
      taker: 0.001,
      currency: 'USDT'
    };
  }

  /**
   * 获取提现费用和限制
   */
  async getWithdrawalInfo() {
    try {
      const data = await this.request('GET', '/api/v5/asset/currencies', {
        ccy: 'XAUT'
      });

      if (data.code !== '0') {
        throw new Error(`OKX API Error: ${data.msg}`);
      }

      const currency = data.data.find(c => c.chain === 'ERC20');
      if (!currency) {
        console.warn('未找到 XAUT ERC20 提现信息');
        return null;
      }

      return {
        minWithdrawal: parseFloat(currency.minWd),
        maxWithdrawal: parseFloat(currency.maxWd),
        fee: parseFloat(currency.fee),
        chain: currency.chain,
        canWithdraw: currency.canWd === 'true'
      };
    } catch (error) {
      console.error('获取提现信息失败:', error.message);
      return null;
    }
  }
}

export default OKXClient;
