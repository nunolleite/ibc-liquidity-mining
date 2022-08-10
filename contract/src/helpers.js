const SECONDS_PER_HOUR = 60n * 60n;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * 24;


const daysToSeconds = numberOfDays => {
    return numberOfDays * SECONDS_PER_DAY;
}

const secondsToDays = numberOfSeconds => {
    // We are not flooring this on purpose, to allow custom time rewards using the CUSTOM or LINEAR strategies
    return numberOfSeconds / SECONDS_PER_DAY;
}

const orderTiers = tiers => {
    tiers.sort((a,b) => a.timeAmount < b.timeAmount ? -1 : 1);
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