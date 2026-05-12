import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

const MAX = 30;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

const Card = styled.div`
  background: linear-gradient(180deg, rgba(30, 18, 55, 0.98) 0%, rgba(10, 5, 22, 0.99) 100%);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 20px;
  padding: 28px 24px 22px;
  width: min(380px, 92vw);
  box-shadow:
    0 32px 80px rgba(0, 0, 0, 0.65),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: 0.01em;
`;

const Sub = styled.p`
  margin: -10px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
`;

const InputWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  padding: 11px 14px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  font-weight: 600;
  outline: none;
  transition: border-color 0.15s;

  &::placeholder { color: rgba(255, 255, 255, 0.28); }
  &:focus { border-color: rgba(255, 46, 118, 0.55); }
`;

const Counter = styled.span<{ $warn: boolean }>`
  font-size: 11px;
  color: ${({ $warn }) => ($warn ? 'rgba(255, 100, 100, 0.85)' : 'rgba(255,255,255,0.35)')};
  align-self: flex-end;
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`;

const Btn = styled.button<{ $primary?: boolean }>`
  height: 38px;
  padding: 0 18px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: filter 0.14s, transform 0.14s;
  border: 1px solid ${({ $primary }) =>
    $primary ? 'rgba(255,46,118,0.55)' : 'rgba(255,255,255,0.14)'};
  background: ${({ $primary }) =>
    $primary
      ? 'radial-gradient(400px 140px at 30% 0%, rgba(255,46,118,0.30), transparent 65%), rgba(255,255,255,0.05)'
      : 'rgba(255,255,255,0.05)'};
  color: rgba(255, 255, 255, 0.88);

  &:hover:not(:disabled) { filter: brightness(1.12); transform: translateY(-1px); }
  &:active:not(:disabled) { transform: translateY(0); }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`;

type Props = {
  current: string | null;
  isSaving: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
};

export function EditProfileModal({ current, isSaving, onSave, onClose }: Props) {
  const [value, setValue] = useState(current ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const remaining = MAX - value.length;
  const canSave = value.trim().length > 0 && value.trim().length <= MAX && !isSaving;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && canSave) onSave(value.trim());
  };

  return (
    <Backdrop onClick={onClose}>
      <Card onClick={(e) => e.stopPropagation()}>
        <Title>Set display name</Title>
        <Sub>Shown on the leaderboard instead of your wallet address.</Sub>

        <InputWrap>
          <Input
            ref={inputRef}
            value={value}
            maxLength={MAX}
            placeholder="e.g. CryptoEagle"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
          />
          <Counter $warn={remaining <= 5}>{remaining} chars left</Counter>
        </InputWrap>

        <Actions>
          <Btn type="button" onClick={onClose} disabled={isSaving}>
            Cancel
          </Btn>
          <Btn type="button" $primary onClick={() => onSave(value.trim())} disabled={!canSave}>
            {isSaving ? 'Saving…' : 'Save'}
          </Btn>
        </Actions>
      </Card>
    </Backdrop>
  );
}
