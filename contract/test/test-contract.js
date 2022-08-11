// @ts-check

import { test } from '@agoric/zoe/tools/prepare-test-env-ava.js';

import { E } from '@endo/eventual-send';
import { lockupStrategies, rewardStrategyTypes } from '../src/definitions.js';

import {setupContract, initializeContract } from "./setup.js";
import {getInitialSupportedIssuers, getGovernanceTokenBrand, getIssuer} from './helpers.js';

test('check correct initialization', async (t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const gTokenBrand = getGovernanceTokenBrand();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: issuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms);

  const notSupportedIssuer = getIssuer('Fake');

  const firstResponse = await E(publicFacet).isIssuerSupported(issuers[0]);
  const secondResponse = await E(publicFacet).isIssuerSupported(notSupportedIssuer);
  
  t.is(firstResponse, true);
  t.is(secondResponse, false);
})

test('able to add another supported issuer', async(t) => {
  const { zoe, installation, timer } = await setupContract();
  const issuers = getInitialSupportedIssuers();
  const gTokenBrand = getGovernanceTokenBrand();

  const terms = harden({
    ammPublicFacet: undefined,
    timerService: timer,
    initialSupportedIssuers: issuers,
    lockupStrategy: lockupStrategies.TIMED_LOCKUP,
    rewardStrategy: { type: rewardStrategyTypes.LINEAR, definition: 0.5 },
    gTokenBrand
  })

  const { creatorFacet, publicFacet } = await initializeContract(zoe, installation, terms);

  const issuerToSupport = getIssuer('Supp');

  await E(creatorFacet).addSupportedIssuer(issuerToSupport);
  const response = await E(publicFacet).isIssuerSupported(issuerToSupport);

  t.is(response, true);
})


// test('zoe - mint payments', async (t) => {
//   const { zoeService } = makeZoeKit(makeFakeVatAdmin().admin);
//   const feePurse = E(zoeService).makeFeePurse();
//   const zoe = E(zoeService).bindDefaultFeePurse(feePurse);

//   // pack the contract
//   const bundle = await bundleSource(contractPath);

//   // install the contract
//   const installation = E(zoe).install(bundle);

//   const { creatorFacet, instance } = await E(zoe).startInstance(installation);

//   // Alice makes an invitation for Bob that will give him 1000 tokens
//   const invitation = E(creatorFacet).makeInvitation();

//   // Bob makes an offer using the invitation
//   const seat = E(zoe).offer(invitation);

//   const paymentP = E(seat).getPayout('Token');

//   // Let's get the tokenIssuer from the contract so we can evaluate
//   // what we get as our payout
//   const publicFacet = E(zoe).getPublicFacet(instance);
//   const tokenIssuer = E(publicFacet).getTokenIssuer();
//   const tokenBrand = await E(tokenIssuer).getBrand();

//   const tokens1000 = AmountMath.make(tokenBrand, 1000n);
//   const tokenPayoutAmount = await E(tokenIssuer).getAmountOf(paymentP);

//   // Bob got 1000 tokens
//   t.deepEqual(tokenPayoutAmount, tokens1000);
// });
