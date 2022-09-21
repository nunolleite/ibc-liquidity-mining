//@ts-check

import { E } from '@endo/far';
import contractDefaults from '../assets/dapp-constants/installationConstants.js';
import { AmountMath } from '@agoric/ertp';

const addRewardLiquidity = async (homePromise, {}) => {
    const home = await homePromise;
    const {
        scratch,
        board,
        zoe,
        wallet
    } = home;

    const {
        CREATOR_FACET_ID,
        GOVERNANCE_BRAND_ID,
        GOVERNANCE_PURSE_PETNAME
    } = contractDefaults;

    const creatorFacet = await E(scratch).get(CREATOR_FACET_ID);
    const governanceTokenBrand = await E(board).getValue(GOVERNANCE_BRAND_ID);
    const addRewardLiquidityInvitation = await E(creatorFacet).makeAddRewardLiquidityInvitation();

    const governanceAmount = AmountMath.make(governanceTokenBrand, 1000n);

    const addRewardLiquidityProposal = harden({
        give: {
            Governance: governanceAmount
        }
    });

    const governancePurse = await E(wallet).getPurse(GOVERNANCE_PURSE_PETNAME);
    const payment = await E(governancePurse).withdraw(governanceAmount);

    const addRewardLiquidityPayment = harden({
        Governance: payment
    });

    console.log('Adding reward token liquidity ...');

    const seat = await E(zoe).offer(
        addRewardLiquidityInvitation,
        addRewardLiquidityProposal,
        addRewardLiquidityPayment
    );

    console.log('Added reward token liquidity ...');

    console.log(await E(seat).getOfferResult());
}

export default addRewardLiquidity;

