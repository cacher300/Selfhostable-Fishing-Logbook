/**
 * Native map credentials are injected at build time. Apple Maps is used on
 * iOS without a key; Android requires a restricted Google Maps SDK key.
 */
module.exports = ({ config }) => {
  const options = {};
  if (process.env.GOOGLE_MAPS_ANDROID_API_KEY) options.androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (process.env.GOOGLE_MAPS_IOS_API_KEY) options.iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
  const mapPlugin = Object.keys(options).length ? ["react-native-maps", options] : "react-native-maps";
  return { ...config, plugins: [...(config.plugins || []), mapPlugin] };
};
