import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { CoveDeposited, CoveSwapped, CoveWithdrawn } from '../types/ClipperCove/ClipperCove'
import { Swap, Token } from '../types/schema'
import { clipperDirectExchangeAddress } from './addresses'
import { BIG_INT_EIGHTEEN, BIG_INT_ONE, LongTailType, ShortTailType } from './constants'
import { loadCove, loadUserCoveStake } from './entities/Cove'
import { updatePoolStatus } from './entities/Pool'
import { upsertUser } from './entities/User'
import { convertTokenToDecimal, loadToken, loadTransactionSource } from './utils'
import { getCoveBalances } from './utils/cove'
import { getCoveAssetPrice, getUsdPrice } from './utils/prices'
import { fetchTokenBalance } from './utils/token'

export function handleCoveDeposited(event: CoveDeposited): void {
  let cove = loadCove(event.params.tokenAddress, event.params.depositor, event.block.timestamp, event.transaction.hash)
  let coveAsset = loadToken(Address.fromString(cove.longtailAsset))
  let balances = getCoveBalances(Address.fromString(cove.id), coveAsset.decimals.toI32())
  let poolTokens = balances[0]
  let assetBalance = balances[1]
  let userCoveStake = loadUserCoveStake(cove.id, event.params.depositor)

  cove.depositCount = cove.depositCount.plus(BIG_INT_ONE)
  cove.poolTokenAmount = poolTokens
  cove.longtailTokenAmount = assetBalance

  userCoveStake.active = true

  cove.save()
  userCoveStake.save()

}

export function handleCoveSwapped(event: CoveSwapped): void {
  let inAsset = loadToken(event.params.inAsset)
  let outAsset = loadToken(event.params.outAsset)

  let inAmount = convertTokenToDecimal(event.params.inAmount, inAsset.decimals)
  let outAmount = convertTokenToDecimal(event.params.outAmount, outAsset.decimals)

  let inputPrice: BigDecimal
  let outputPrice: BigDecimal
  let inTokenBalance: BigDecimal
  let outTokenBalance: BigDecimal
  let inTokenBalanceUsd: BigDecimal
  let outTokenBalanceUsd: BigDecimal
  let inCovePoolTokenAmount: BigDecimal 
  let outCovePoolTokenAmount: BigDecimal 

  if (inAsset.type === LongTailType) {
    let coveAssetPrice = getCoveAssetPrice(event.params.inAsset, inAsset.decimals.toI32())
    inputPrice = coveAssetPrice.get('assetPrice') as BigDecimal
    inTokenBalance = coveAssetPrice.get('assetBalance') as BigDecimal
    inTokenBalanceUsd = inTokenBalance.times(inputPrice)
    inCovePoolTokenAmount = coveAssetPrice.get('poolTokenBalance') as BigDecimal
  } else {
    inputPrice = getUsdPrice(inAsset.symbol)
    inTokenBalance = fetchTokenBalance(inAsset, clipperDirectExchangeAddress)
    inTokenBalanceUsd = inputPrice.times(inTokenBalance)
  }

  if (outAsset.type === LongTailType) {
    let coveAssetPrice = getCoveAssetPrice(event.params.outAsset, outAsset.decimals.toI32())
    outputPrice = coveAssetPrice.get('assetPrice') as BigDecimal
    outTokenBalance = coveAssetPrice.get('assetBalance') as BigDecimal
    outTokenBalanceUsd = outTokenBalance.times(outputPrice)
    outCovePoolTokenAmount = coveAssetPrice.get('poolTokenBalance') as BigDecimal
  } else {
    outputPrice = getUsdPrice(outAsset.symbol)
    outTokenBalance = fetchTokenBalance(outAsset, clipperDirectExchangeAddress)
    outTokenBalanceUsd = outputPrice.times(outTokenBalance)
  }

  let amountInUsd = inputPrice.times(inAmount)
  let amountOutUsd = outputPrice.times(outAmount)
  let transactionVolume = amountInUsd.plus(amountOutUsd).div(BigDecimal.fromString('2'))

  inAsset.txCount = inAsset.txCount.plus(BIG_INT_ONE)
  outAsset.txCount = outAsset.txCount.plus(BIG_INT_ONE)

  let swap = new Swap(
    event.transaction.hash
      .toHex()
      .concat('-')
      .concat(event.logIndex.toString()),
  )
  swap.transaction = event.transaction.hash
  swap.timestamp = event.block.timestamp
  swap.inToken = inAsset.id
  swap.outToken = outAsset.id
  swap.origin = event.transaction.from
  swap.recipient = event.params.recipient
  swap.amountIn = inAmount
  swap.amountOut = outAmount
  swap.logIndex = event.logIndex
  swap.pricePerInputToken = inputPrice
  swap.pricePerOutputToken = outputPrice
  swap.amountInUSD = amountInUsd
  swap.amountOutUSD = amountOutUsd
  swap.sender = event.transaction.from.toHexString()

  outAsset.txCount = outAsset.txCount.plus(BIG_INT_ONE)
  outAsset.volume = outAsset.volume.plus(outAmount)
  outAsset.volumeUSD = outAsset.volumeUSD.plus(amountOutUsd)
  outAsset.tvl = outTokenBalance
  outAsset.tvlUSD = outTokenBalanceUsd
  outAsset.save()

  inAsset.txCount = inAsset.txCount.plus(BIG_INT_ONE)
  inAsset.volume = inAsset.volume.plus(inAmount)
  inAsset.volumeUSD = inAsset.volumeUSD.plus(amountInUsd)
  inAsset.tvl = inTokenBalance
  inAsset.tvlUSD = inTokenBalanceUsd
  inAsset.save()

  let txSource = loadTransactionSource(event.params.auxiliaryData)
  swap.transactionSource = txSource.id
  txSource.txCount = txSource.txCount.plus(BIG_INT_ONE)

  if (inAsset.type === ShortTailType || outAsset.type === ShortTailType) {
    let isUnique = upsertUser(event.transaction.from.toHexString(), event.block.timestamp, transactionVolume)
    updatePoolStatus(event.block.timestamp, transactionVolume, isUnique)
  }

  if (inAsset.type === LongTailType) {
    let cove = loadCove(event.params.inAsset, event.params.recipient, event.block.timestamp, event.transaction.hash)
    cove.swapCount = cove.swapCount.plus(BIG_INT_ONE)
    cove.poolTokenAmount = inCovePoolTokenAmount
    cove.longtailTokenAmount = inTokenBalance
    cove.volumeUSD = transactionVolume

    cove.save()
  }

  if (outAsset.type === LongTailType) {
    let cove = loadCove(event.params.outAsset, event.params.recipient, event.block.timestamp, event.transaction.hash)
    cove.swapCount = cove.swapCount.plus(BIG_INT_ONE)
    cove.poolTokenAmount = outCovePoolTokenAmount
    cove.longtailTokenAmount = outTokenBalance
    cove.volumeUSD = transactionVolume

    cove.save()

  }

  swap.save()
  txSource.save()
}
export function handleCoveWithdrawn(event: CoveWithdrawn): void {}