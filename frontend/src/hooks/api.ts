import { ProgramMetadata } from '@gear-js/api';
import { useEffect, useState } from 'react';
import { useToast } from './useToast';

function useProgramMetadata(source: string) {
  const toast = useToast();

  const [metadata, setMetadata] = useState<ProgramMetadata>();

  useEffect(() => {
    fetch(source)
      .then((response) => response.text())
      .then((raw) => `0x${raw}`)
      .then((metaHex) => ProgramMetadata.from(metaHex))
      .then((result) => setMetadata(result))
      .catch(({ message }: Error) => toast.error(message));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return metadata;
}

export { useProgramMetadata };
