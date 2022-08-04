const lockupStrategies = {
    TIMED_LOCKUP: "lock",
    UNLOCK: "unlock"
};

const rewardStrategyTypes = {
    TIER: "tier",
    LINEAR: "linear",
    CUSTOM: "custom"
};

harden(lockupStrategies);
harden(rewardStrategyTypes);


export {
    lockupStrategies,
    rewardStrategyTypes
};