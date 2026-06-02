const ADDRESS = {
  NODE: (import.meta.env.VITE_NODE_ADDRESS as string | undefined) || 'wss://rpc.vara.network',
};

export { ADDRESS };
