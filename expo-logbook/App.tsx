import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

function webAppPath() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `/logbook/index.html${window.location.search || ""}`;
  }

  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoClient?.hostUri || "";
  const host = hostUri.split(",")[0];
  return `http://${host}/logbook/index.html`;
}

export default function App() {
  const [loading, setLoading] = useState(Platform.OS !== "web");
  const source = useMemo(() => webAppPath(), []);

  if (Platform.OS === "web") {
    return (
      <View style={styles.webShell}>
        <iframe title="Detailed Fishing Logbook" src={source} style={styles.iframe} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.nativeShell}>
      <StatusBar style="light" />
      {source.endsWith("/logbook/index.html") ? (
        <View style={styles.nativeMessage}>
          <Text style={styles.nativeMessageTitle}>Expo dev server not found</Text>
          <Text style={styles.nativeMessageText}>Start this app with Expo so the cloned logbook files can be served to the WebView.</Text>
        </View>
      ) : (
        <>
          <WebView
            source={{ uri: source }}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            onLoadEnd={() => setLoading(false)}
            style={styles.webView}
          />
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color="#ffffff" />
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  webShell: {
    flex: 1,
    backgroundColor: "#eef3f6"
  },
  iframe: {
    borderWidth: 0,
    width: "100%",
    height: "100%"
  },
  nativeShell: {
    flex: 1,
    backgroundColor: "#102a35"
  },
  webView: {
    flex: 1,
    backgroundColor: "#eef3f6"
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#102a35"
  },
  nativeMessage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  nativeMessageTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center"
  },
  nativeMessageText: {
    color: "#c9d7dd",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  }
});
