import { BadRequestException } from '@nestjs/common';
import { XService } from './x.service';

const config = {
  get: (key: string) => {
    if (key === 'smartCupXUsername') return 'SmartCupLeague';
    if (key === 'smartCupAppUrl') return 'https://app.smartcupleague.com/';
    return undefined;
  },
  getOrThrow: (key: string) => {
    if (key === 'xBearerToken') return 'test-token';
    throw new Error(`Missing config ${key}`);
  },
};

describe('XService', () => {
  const service = new XService(config as never);

  it('accepts a repost of a SmartCup post', async () => {
    await expect(service.verifyTask({
      tweet: {
        id: '1',
        text: '',
        author_id: '99',
        referenced_tweets: [{ type: 'retweeted', id: '10' }],
      },
      includedTweets: [{ id: '10', text: 'Campaign post', author_id: '42' }],
      includedUsers: [
        { id: '42', username: 'SmartCupLeague' },
        { id: '99', username: 'TimurMedov' },
      ],
    }, 'repost', '@TimurMedov')).resolves.toBe('timurmedov');
  });

  it('rejects a repost of a non-SmartCup post', async () => {
    await expect(service.verifyTask({
      tweet: {
        id: '1',
        text: '',
        author_id: '99',
        referenced_tweets: [{ type: 'retweeted', id: '10' }],
      },
      includedTweets: [{ id: '10', text: 'Other post', author_id: '7' }],
      includedUsers: [
        { id: '7', username: 'other_account' },
        { id: '99', username: 'TimurMedov' },
      ],
    }, 'repost', '@TimurMedov')).rejects.toThrow(BadRequestException);
  });

  it('accepts a repost submission with the original SmartCup post URL and username', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({
      data: [{ id: '99', username: 'TimurMedov' }],
    }));

    try {
      await expect(service.verifyTask({
        tweet: {
          id: '10',
          text: 'SmartCup campaign post',
          author_id: '42',
        },
        includedTweets: [],
        includedUsers: [{ id: '42', username: 'SmartCupLeague' }],
      }, 'repost', '@TimurMedov')).resolves.toBe('timurmedov');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/2/tweets/10/retweeted_by',
        }),
        expect.objectContaining({
          headers: { authorization: 'Bearer test-token' },
        }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('rejects an original SmartCup post when the user has not reposted it', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({
      data: [{ id: '99', username: 'someone_else' }],
    }));

    try {
      await expect(service.verifyTask({
        tweet: {
          id: '10',
          text: 'SmartCup campaign post',
          author_id: '42',
        },
        includedTweets: [],
        includedUsers: [{ id: '42', username: 'SmartCupLeague' }],
      }, 'repost', '@TimurMedov')).rejects.toThrow(/has not reposted/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('rejects an original SmartCup post repost submission without username', async () => {
    await expect(service.verifyTask({
      tweet: {
        id: '10',
        text: 'SmartCup campaign post',
        author_id: '42',
      },
      includedTweets: [],
      includedUsers: [{ id: '42', username: 'SmartCupLeague' }],
    }, 'repost', '')).rejects.toThrow(/X username/);
  });

  it('accepts a campaign post quoting a SmartCup post with campaign context', async () => {
    await expect(service.verifyTask({
      tweet: {
        id: '2',
        text: 'SmartCup predictions with VARA freebets',
        author_id: '99',
        referenced_tweets: [{ type: 'quoted', id: '10' }],
      },
      includedTweets: [{ id: '10', text: 'Campaign post', author_id: '42' }],
      includedUsers: [
        { id: '42', username: 'SmartCupLeague' },
        { id: '99', username: 'TimurMedov' },
      ],
    }, 'post')).resolves.toBe('timurmedov');
  });

  it('accepts the weekly standalone SmartCup campaign post', async () => {
    await expect(service.verifyTask({
      tweet: {
        id: '3',
        author_id: '99',
        text: [
          'SmartCup League: get VARA freebet credits and predict World Cup scores with your agent.',
          '',
          'https://t.co/example',
          '',
          'Open the tournament, make your prediction, and climb the leaderboard.',
        ].join('\n'),
        entities: {
          urls: [{ url: 'https://t.co/example', expanded_url: 'https://app.smartcupleague.com/' }],
        },
      },
      includedTweets: [],
      includedUsers: [{ id: '99', username: 'TimurMedov' }],
    }, 'post')).resolves.toBe('timurmedov');
  });

  it('rejects standalone post task posts without the SmartCup app URL', async () => {
    await expect(service.verifyTask({
      tweet: {
        id: '4',
        author_id: '99',
        text: [
          'SmartCup League: get VARA freebet credits and predict World Cup scores with your agent.',
          'Open the tournament, make your prediction, and climb the leaderboard.',
        ].join('\n'),
      },
      includedTweets: [],
      includedUsers: [{ id: '99', username: 'TimurMedov' }],
    }, 'post', '@TimurMedov')).rejects.toThrow(/SmartCup app URL/);
  });

  it('rejects standalone post task posts with a lookalike SmartCup URL host', async () => {
    await expect(service.verifyTask({
      tweet: {
        id: '5',
        author_id: '99',
        text: [
          'SmartCup League: get VARA freebet credits and predict World Cup scores with your agent.',
          'https://app.smartcupleague.com.evil/',
          'Open the tournament, make your prediction, and climb the leaderboard.',
        ].join('\n'),
      },
      includedTweets: [],
      includedUsers: [{ id: '99', username: 'TimurMedov' }],
    }, 'post', '@TimurMedov')).rejects.toThrow(/SmartCup app URL/);
  });

  it('rejects a campaign post authored by a different X account', async () => {
    await expect(service.verifyTask({
      tweet: {
        id: '6',
        text: 'SmartCup predictions with VARA freebets',
        author_id: '88',
        referenced_tweets: [{ type: 'quoted', id: '10' }],
      },
      includedTweets: [{ id: '10', text: 'Campaign post', author_id: '42' }],
      includedUsers: [
        { id: '42', username: 'SmartCupLeague' },
        { id: '88', username: 'someone_else' },
      ],
    }, 'post', '@TimurMedov')).rejects.toThrow(/authored by @timurmedov/);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
