// Configurações do usuário, guardadas em browser.storage.local (usado pelo background e pelo popup).

const CONFIG_PADRAO = {
  clientId: '',
  clientSecret: '',
  calendarId: 'primary',
  incluirVencidas: false,
};

async function lerConfig() {
  const { config } = await browser.storage.local.get('config');
  return { ...CONFIG_PADRAO, ...config };
}

async function salvarConfig(parcial) {
  const atual = await lerConfig();
  await browser.storage.local.set({ config: { ...atual, ...parcial } });
}
