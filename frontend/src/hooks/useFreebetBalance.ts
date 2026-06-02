import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { HexString } from '@gear-js/api';
import { FreebetLedgerProgram } from '@/hocs/freebetLedger';
import { toHexAddress } from '@/utils/address';

const FREEBET_LEDGER_ID = import.meta.env.VITE_FREEBET_LEDGER_ID as string | undefined;
export const FREEBET_BALANCE_CHANGED_EVENT = 'freebet:balance-changed';

export function useFreebetBalance() {
  const { api, isApiReady } = useApi();
  const { account } = useAccount();
  const [balance, setBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallet = useMemo(() => {
    const raw = account?.decodedAddress ?? (account as any)?.address ?? null;
    return toHexAddress(raw);
  }, [account]);

  const ledger = useMemo(() => {
    if (!api || !isApiReady || !FREEBET_LEDGER_ID) return null;
    return new FreebetLedgerProgram(api, FREEBET_LEDGER_ID as HexString);
  }, [api, isApiReady]);

  const refetch = useCallback(async () => {
    if (!wallet) {
      setBalance('0');
      setError(null);
      return;
    }

    if (!ledger) {
      setBalance('0');
      setError(FREEBET_LEDGER_ID ? 'Freebet ledger is not ready' : 'Freebet ledger is not configured');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const nextBalance = await ledger.service.balanceOf(wallet, wallet);
      setBalance(nextBalance);
    } catch (e) {
      setBalance('0');
      setError(e instanceof Error ? e.message : 'Could not load freebet balance');
    } finally {
      setIsLoading(false);
    }
  }, [ledger, wallet]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const onBalanceChanged = () => {
      void refetch();
    };

    window.addEventListener(FREEBET_BALANCE_CHANGED_EVENT, onBalanceChanged);
    return () => window.removeEventListener(FREEBET_BALANCE_CHANGED_EVENT, onBalanceChanged);
  }, [refetch]);

  return {
    balance,
    error,
    isConfigured: Boolean(FREEBET_LEDGER_ID),
    isLoading,
    refetch,
    wallet,
  };
}
