//@ts-check
const lockupStrategies = {
    TIMED_LOCKUP: "lock",
    UNLOCK: "unlock"
};

const rewardStrategyTypes = {
    TIER: "tier",
    LINEAR: "linear",
    CUSTOM: "custom"
};

const DEFAULT_WARN_MINIMUM_GOVERNANCE_TOKEN_SUPPLY = 100n;

harden(lockupStrategies);
harden(rewardStrategyTypes);


export {
    lockupStrategies,
    rewardStrategyTypes,
    DEFAULT_WARN_MINIMUM_GOVERNANCE_TOKEN_SUPPLY
};