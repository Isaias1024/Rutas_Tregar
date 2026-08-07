module.exports = (api) => {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: [
      // Tiene que ir al final: reescribe el codigo que ya paso por todo lo
      // demas (Reanimated 4 depende de esto para los worklets).
      'react-native-worklets/plugin',
    ],
  };
};
