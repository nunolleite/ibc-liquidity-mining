import { AmountMath, AssetKind, makeIssuerKit } from "@agoric/ertp";
import { E } from '@endo/far';

const getInitialSupportedIssuers = () => {
    const moolaKit = makeIssuerKit('Moola');
    const vanKit = makeIssuerKit('Van');

    return {
        moola: moolaKit,
        van: vanKit
    };
};

const getIssuer = name => {
    const { issuer, mint, brand } = makeIssuerKit(name);
    return { issuer, mint, brand };
}

const getGovernanceTokenKit = () => {
    return makeIssuerKit('Gov');
}

const getSeat = async (zoe, invitation, proposal, paymentKeywordRecord, offerArgs = {}) => {
    return await E(zoe).offer(
        invitation,
        proposal,
        paymentKeywordRecord,
        offerArgs
    )
};

const getAddRewardLiquiditySeat = async (zoe, creatorFacet, governanceTokenKit, governanceAmount) => {
    return await getSeat(
        zoe,
        await E(creatorFacet).makeAddRewardLiquidityInvitation(),
        harden({ give: { Governance: governanceAmount }}),
        harden({ Governance: governanceTokenKit.mint.mintPayment(governanceAmount)})
    )
};

const getLockupSeat = async (zoe, publicFacet, lpTokensMint, lpTokensAmount, polTokenAmount, offerArgs) => {
    return await getSeat(
        zoe,
        await E(publicFacet).makeLockupInvitation(),
        { give: { LpTokens: lpTokensAmount}, want: { PolToken: polTokenAmount }},
        harden({ LpTokens: lpTokensMint.mintPayment(lpTokensAmount) }),
        offerArgs
    )
}

const getUnlockSeat = async (zoe, publicFacet, polTokenAmount, polBrand, payment, offerArgs) => {
    return await getSeat(
        zoe,
        await E(publicFacet).makeUnlockInvitation(),
        { give: { PolToken: polTokenAmount }, want: { UnbondingToken: AmountMath.makeEmpty(polBrand, AssetKind.SET)}},
        harden({ PolToken: payment }),
        offerArgs
    )
};

const getRedeemSeat = async (zoe, publicFacet, polTokenAmount, tokensAmount, payment) => {
    return await getSeat(
        zoe,
        await E(publicFacet).makeRedeemInvitation(),
        { give: { RedeemToken: polTokenAmount }, want: { LpTokens: tokensAmount }},
        harden({ RedeemToken: payment })
    )
};

const getWithdrawSeat = async (zoe, publicFacet, polTokenAmount, governanceTokenBrand, governanceAmountValue, payment) => {
    return await getSeat(
        zoe,
        await E(publicFacet).makeWithdrawRewardsInvitation(),
        { give: { WithdrawToken: polTokenAmount }, want: { Governance: AmountMath.make(governanceTokenBrand, governanceAmountValue)}},
        harden({ WithdrawToken: payment })
    )
};

export {
    getInitialSupportedIssuers,
    getIssuer,
    getGovernanceTokenKit,
    getAddRewardLiquiditySeat,
    getLockupSeat,
    getUnlockSeat,
    getRedeemSeat,
    getWithdrawSeat
}