import { makeIssuerKit } from "@agoric/ertp";
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

const getAddRewardLiquiditySeat = async (zoe, creatorFacet, governanceTokenKit, governanceAmount) => {
    const proposal = harden({ give: { Governance: governanceAmount }});
    const paymentKeywordRecord = harden({ Governance: governanceTokenKit.mint.mintPayment(governanceAmount)});
    const invitation = await E(creatorFacet).makeAddRewardLiquidityInvitation();

    return await E(zoe).offer(
        invitation,
        proposal,
        paymentKeywordRecord
    )
};

const getLockupSeat = async (zoe, publicFacet, lpTokensMint, lpTokensAmount, polTokenAmount, offerArgs) => {
    const proposal = { give: { LpTokens: lpTokensAmount }, want: { PolToken: polTokenAmount }};
    const paymentKeywordRecord = harden({ LpTokens: lpTokensMint.mintPayment(lpTokensAmount)});
    const invitation = await E(publicFacet).makeLockupInvitation();

    return await E(zoe).offer(
        invitation,
        proposal,
        paymentKeywordRecord,
        offerArgs
    )
}

export {
    getInitialSupportedIssuers,
    getIssuer,
    getGovernanceTokenKit,
    getAddRewardLiquiditySeat,
    getLockupSeat
}