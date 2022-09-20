//@ts-check

import { E } from '@endo/far';
import contractDefaults from '../assets/dapp-constants/installationConstants.js';
import { AmountMath } from '@agoric/ertp';

const withdraw = async (homePromise, {}) => {
    const home = await homePromise;
    const {
        board,
        wallet,
        zoe
    } = home;

    const {
        PUBLIC_FACET_ID,
        GOVERNANCE_PURSE_PETNAME,
        GOVERNANCE_ISSUER_ID,
        POL_TOKEN_ISSUER_ID,
        POL_TOKEN_PURSE_PETNAME,
    } = contractDefaults;

    const [publicFacet, governancePurse, polPurse, governanceIssuer, polTokenIssuer] = await Promise.all([
        E(board).getValue(PUBLIC_FACET_ID),
        E(wallet).getPurse(GOVERNANCE_PURSE_PETNAME),
        E(wallet).getPurse(POL_TOKEN_PURSE_PETNAME),
        E(board).getValue(GOVERNANCE_ISSUER_ID),
        E(board).getValue(POL_TOKEN_ISSUER_ID)
    ]);

    console.log('Building withdraw amounts ...');
    const giveAmount = await E(polPurse).getCurrentAmount();
    const wantAmount = AmountMath.make(await E(governanceIssuer).getBrand(), 5n);
    const payment = await E(polPurse).withdraw(giveAmount);

    console.log('Collecting invitation ...');
    const invitation = await E(publicFacet).makeWithdrawRewardsInvitation();

    console.log('Building proposal ...');
    const proposal = harden({
        give: { WithdrawToken: giveAmount},
        want: { Governance: wantAmount}
    });

    const paymentRecord = harden({ WithdrawToken: payment});

    console.log('Initiating withdraw ...');

    const seat = await E(zoe).offer(
        invitation,
        proposal,
        paymentRecord
    );

    console.log(await E(seat).getOfferResult());

    const payout = await E(seat).getPayout('Governance');
    await E(governancePurse).deposit(payout);

    const returnToken = await E(seat).getPayout('WithdrawToken');
    await E(polPurse).deposit(returnToken);

    console.log('Withdrawn rewards');
}

export default withdraw;