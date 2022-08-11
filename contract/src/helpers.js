//@ts-check
const SECONDS_PER_HOUR = 60n * 60n;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * 24n;

// TODO: daysToSeconds and secondsToDays might be misleading since the chain timer will give us millis
// TODO: Change this to daysToTimerUnits and timerUnitsToDays so that it's automatic depending on the timer being used
/**
 * 
 * @param {Number} numberOfDays 
 * @returns {bigint}
 */
const daysToSeconds = numberOfDays => {
    return BigInt(numberOfDays) * SECONDS_PER_DAY;
}

/**
 * 
 * @param {bigint} numberOfSeconds 
 * @returns 
 */
const secondsToDays = numberOfSeconds => {
    // We are not flooring this on purpose, to allow custom time rewards using the CUSTOM or LINEAR strategies
    return numberOfSeconds / SECONDS_PER_DAY;
}

/**
 * 
 * @param {Array<Object>} tiers 
 */
const orderTiers = tiers => {
    tiers.sort((a, b) => a.timeAmount < b.timeAmount ? -1 : 1);
}

harden(daysToSeconds);
harden(secondsToDays);
harden(orderTiers);

export {
    daysToSeconds,
    secondsToDays,
    orderTiers,
    SECONDS_PER_HOUR,
    SECONDS_PER_DAY
};