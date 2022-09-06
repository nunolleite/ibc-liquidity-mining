//@ts-check
const SECONDS_PER_HOUR = 60n * 60n;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * 24n;

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
 * @note Assumes usage of the chain timer
 * @returns 
 */
const secondsToDays = numberOfSeconds => {
    // We are not flooring this on purpose, to allow custom time rewards using the CUSTOM or LINEAR strategies
    return Number(numberOfSeconds) / Number(SECONDS_PER_DAY);
}

/**
 * 
 * @param {Array<Object>} tiers
 * @returns {Array<Object>}
 */
const orderTiers = tiers => {
    return tiers.slice().sort((a, b) => a.timeAmount < b.timeAmount ? -1 : 1);
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