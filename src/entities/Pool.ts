import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { DailyPoolStatus, HourlyPoolStatus, Pool } from '../../types/schema'
import { BIG_DECIMAL_ZERO, BIG_INT_ONE, BIG_INT_ZERO, DIRECT_EXCHANGE_ADDRESS, ONE_DAY, ONE_HOUR } from '../constants'
import { getOpenTime } from '../utils/timeHelpers'

export function loadPool(): Pool {
  let pool = Pool.load(DIRECT_EXCHANGE_ADDRESS)

  if (!pool) {
    pool = new Pool(DIRECT_EXCHANGE_ADDRESS)
    pool.avgTrade = BIG_DECIMAL_ZERO
    pool.volumeUSD = BIG_DECIMAL_ZERO
    pool.txCount = BIG_INT_ZERO

    pool.save()
  }

  return pool as Pool
}

export function updatePoolStatus(timestamp: BigInt, addedTxVolume: BigDecimal): Pool {
  let pool = loadPool()
  pool.txCount = pool.txCount.plus(BIG_INT_ONE)
  pool.volumeUSD = pool.volumeUSD.plus(addedTxVolume)
  pool.avgTrade = pool.volumeUSD.div(pool.txCount.toBigDecimal())

  updateDailyPoolStatus(pool, timestamp, addedTxVolume)
  updateHourlyPoolStatus(pool, timestamp, addedTxVolume)

  pool.save()

  return pool
}

function updateDailyPoolStatus(pool: Pool, timestamp: BigInt, addedTxVolume: BigDecimal): DailyPoolStatus {
  let openTime = getOpenTime(timestamp, ONE_DAY)
  let from = openTime
  let to = openTime.plus(ONE_DAY).minus(BIG_INT_ONE)

  let id = DIRECT_EXCHANGE_ADDRESS.concat('-')
    .concat(from.toString())
    .concat(to.toString())

  let dailyPoolStatus = DailyPoolStatus.load(id) as DailyPoolStatus

  // TODO: refactor creating and updating to same function across different intervals (day, hour, etc ...)
  if (!dailyPoolStatus) {
    dailyPoolStatus = new DailyPoolStatus(id)
    dailyPoolStatus.avgTrade = BIG_DECIMAL_ZERO
    dailyPoolStatus.volumeUSD = BIG_DECIMAL_ZERO
    dailyPoolStatus.txCount = BIG_INT_ZERO
    dailyPoolStatus.pool = pool.id
    dailyPoolStatus.from = from
    dailyPoolStatus.to = to
  }

  dailyPoolStatus.txCount = dailyPoolStatus.txCount.plus(BIG_INT_ONE)
  dailyPoolStatus.volumeUSD = dailyPoolStatus.volumeUSD.plus(addedTxVolume)
  dailyPoolStatus.avgTrade = dailyPoolStatus.volumeUSD.div(dailyPoolStatus.txCount.toBigDecimal())

  dailyPoolStatus.save()

  return dailyPoolStatus
}

function updateHourlyPoolStatus(pool: Pool, timestamp: BigInt, addedTxVolume: BigDecimal): HourlyPoolStatus {
  let openTime = getOpenTime(timestamp, ONE_HOUR)
  let from = openTime
  let to = openTime.plus(ONE_HOUR).minus(BIG_INT_ONE)

  let id = DIRECT_EXCHANGE_ADDRESS.concat('-')
    .concat(from.toString())
    .concat(to.toString())

  let hourlyPoolStatus = HourlyPoolStatus.load(id) as HourlyPoolStatus

  // TODO: refactor creating and updating to same function across different intervals (day, hour, etc ...)
  if (!hourlyPoolStatus) {
    hourlyPoolStatus = new HourlyPoolStatus(id)
    hourlyPoolStatus.avgTrade = BIG_DECIMAL_ZERO
    hourlyPoolStatus.volumeUSD = BIG_DECIMAL_ZERO
    hourlyPoolStatus.txCount = BIG_INT_ZERO
    hourlyPoolStatus.pool = pool.id
    hourlyPoolStatus.from = from
    hourlyPoolStatus.to = to
  }

  hourlyPoolStatus.txCount = hourlyPoolStatus.txCount.plus(BIG_INT_ONE)
  hourlyPoolStatus.volumeUSD = hourlyPoolStatus.volumeUSD.plus(addedTxVolume)
  hourlyPoolStatus.avgTrade = hourlyPoolStatus.volumeUSD.div(hourlyPoolStatus.txCount.toBigDecimal())

  hourlyPoolStatus.save()

  return hourlyPoolStatus
}