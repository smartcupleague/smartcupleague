import { ConflictException } from '@nestjs/common';
import { RewardsService } from './rewards.service';

describe('RewardsService', () => {
  it('exposes SmartCup X task rewards as repost 100 VARA and post 300 VARA', () => {
    const service = new RewardsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(service.getTasks().x).toEqual([
      { taskType: 'repost', amountVara: '100', cadence: 'weekly' },
      { taskType: 'post', amountVara: '300', cadence: 'weekly' },
    ]);
  });

  it('pays 300 VARA freebet for a verified SmartCup post task', async () => {
    const submission = {
      wallet: '0x'.padEnd(66, '4'),
      actorId: '0x'.padEnd(66, '4'),
      taskType: 'post',
      tweetUrl: 'https://x.com/timurmedov/status/789',
      tweetId: '789',
      xUsername: 'timurmedov',
      weekKey: expect.any(String),
      rewardAmountPlanck: '300000000000000',
      grantId: expect.stringContaining(':post'),
      reason: expect.stringContaining('post'),
    };
    const submissions = {
      findOne: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
      create: jest.fn((value) => value),
      save: jest.fn()
        .mockResolvedValueOnce(submission)
        .mockImplementationOnce((value) => Promise.resolve(value)),
    };
    const xService = {
      fetchTweet: jest.fn().mockResolvedValue({
        tweet: { id: '789', text: 'SmartCup freebet https://app.smartcupleague.com/' },
        includedTweets: [],
        includedUsers: [],
      }),
      verifyTask: jest.fn().mockResolvedValue('timurmedov'),
    };
    const chain = {
      grantLedgerFreebet: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RewardsService(
      submissions as never,
      {} as never,
      {} as never,
      {} as never,
      xService as never,
      chain as never,
    );

    await service.submitXTask({
      wallet: '0x'.padEnd(66, '4'),
      taskType: 'post',
      tweetUrl: 'https://x.com/timurmedov/status/789',
    });

    expect(submissions.create).toHaveBeenCalledWith(expect.objectContaining(submission));
    expect(chain.grantLedgerFreebet).toHaveBeenCalledWith(
      '0x'.padEnd(66, '4'),
      300000000000000n,
      expect.stringContaining(':post'),
      expect.stringContaining('post'),
    );
  });

  it('rejects a second wallet claiming the same X account task in the same week', async () => {
    const submissions = {
      findOne: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing', xUsername: 'timurmedov' }),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };
    const xService = {
      fetchTweet: jest.fn().mockResolvedValue({ tweet: { id: '123', text: '' }, includedTweets: [], includedUsers: [] }),
      verifyTask: jest.fn().mockResolvedValue('timurmedov'),
    };
    const chain = {
      grantLedgerFreebet: jest.fn(),
    };
    const service = new RewardsService(
      submissions as never,
      {} as never,
      {} as never,
      {} as never,
      xService as never,
      chain as never,
    );

    await expect(service.submitXTask({
      wallet: '0x'.padEnd(66, '1'),
      taskType: 'repost',
      tweetUrl: 'https://x.com/SmartCupLeague/status/123',
      xUsername: '@TimurMedov',
    })).rejects.toThrow(ConflictException);

    expect(submissions.findOne).toHaveBeenNthCalledWith(1, {
      where: {
        xUsername: 'timurmedov',
        taskType: 'repost',
        tweetId: '123',
      },
    });
    expect(submissions.findOne).toHaveBeenNthCalledWith(2, {
      where: {
        xUsername: 'timurmedov',
        taskType: 'repost',
        weekKey: expect.any(String),
      },
    });
    expect(xService.fetchTweet).not.toHaveBeenCalled();
    expect(xService.verifyTask).not.toHaveBeenCalled();
    expect(chain.grantLedgerFreebet).not.toHaveBeenCalled();
  });

  it('rejects the same X account claiming the same task post again outside the weekly wallet limit', async () => {
    const submissions = {
      findOne: jest.fn()
        .mockResolvedValueOnce({ id: 'existing', xUsername: 'timurmedov', tweetId: '123' }),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };
    const xService = {
      fetchTweet: jest.fn().mockResolvedValue({ tweet: { id: '123', text: '' }, includedTweets: [], includedUsers: [] }),
      verifyTask: jest.fn().mockResolvedValue('timurmedov'),
    };
    const service = new RewardsService(
      submissions as never,
      {} as never,
      {} as never,
      {} as never,
      xService as never,
      { grantLedgerFreebet: jest.fn() } as never,
    );

    await expect(service.submitXTask({
      wallet: '0x'.padEnd(66, '2'),
      taskType: 'post',
      tweetUrl: 'https://x.com/timurmedov/status/123',
    })).rejects.toThrow('This X post has already been paid');

    expect(xService.fetchTweet).not.toHaveBeenCalled();
    expect(xService.verifyTask).not.toHaveBeenCalled();
  });

  it('rejects a wallet that already used this weekly task before X lookup', async () => {
    const submissions = {
      findOne: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-wallet' }),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };
    const xService = {
      fetchTweet: jest.fn(),
      verifyTask: jest.fn(),
    };
    const service = new RewardsService(
      submissions as never,
      {} as never,
      {} as never,
      {} as never,
      xService as never,
      { grantLedgerFreebet: jest.fn() } as never,
    );

    await expect(service.submitXTask({
      wallet: '0x'.padEnd(66, '3'),
      taskType: 'post',
      tweetUrl: 'https://x.com/timurmedov/status/456',
    })).rejects.toThrow('This wallet already received the post reward this week');

    expect(xService.fetchTweet).not.toHaveBeenCalled();
  });

  it('grants the referrer freebet after an invited friend reaches 5 bets', async () => {
    const referrer = '0x'.padEnd(66, 'a');
    const friend = '0x'.padEnd(66, 'b');
    const referralRewards = {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve({ id: 'reward-1', ...value })),
    };
    const referralPairs = {
      findOne: jest.fn().mockResolvedValue({
        referrer,
        referrerActorId: referrer,
        friend,
        friendActorId: friend,
        status: 'active',
      }),
    };
    const referralProgress = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const chain = {
      grantLedgerFreebet: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RewardsService(
      {} as never,
      referralRewards as never,
      referralPairs as never,
      referralProgress as never,
      {} as never,
      chain as never,
    );

    const result = await service.syncReferralActivity({
      friend,
      betCount: 5,
    });

    expect(result.progress.betCount).toBe(5);
    expect(result.grants).toHaveLength(1);
    expect(chain.grantLedgerFreebet).toHaveBeenCalledTimes(1);
    expect(chain.grantLedgerFreebet).toHaveBeenCalledWith(
      referrer,
      150000000000000n,
      `ref:${referrer}:${friend}:5:referrer`,
      'referral 5 referrer',
    );
  });
});
