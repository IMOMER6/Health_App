import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useSettingsStore } from "../src/state/settingsStore";
import { useUserStore } from "../src/state/userStore";
import { Card } from "../src/ui/components/Card";
import { Chip } from "../src/ui/components/Chip";
import { Screen } from "../src/ui/components/Screen";
import { colors } from "../src/ui/theme";
import { getConnectorStatus, readLast24h, requestPermissions } from "../src/health/healthProvider";
import { uploadToBackend } from "../src/health/sync";

export default function SettingsScreen() {
  const storageMode = useSettingsStore((s) => s.storageMode);
  const setStorageMode = useSettingsStore((s) => s.setStorageMode);
  const activityMetric = useSettingsStore((s) => s.activityMetric);
  const setActivityMetric = useSettingsStore((s) => s.setActivityMetric);

  const userId = useUserStore((s) => s.userId);

  const [connectorStatus, setConnectorStatus] = useState<string>("Checking availability...");
  const [busy, setBusy] = useState(false);

  const isNative = useMemo(() => connectorStatus.startsWith("Available"), [connectorStatus]);

  const refreshStatus = async () => {
    const s = await getConnectorStatus();
    if (s.available) setConnectorStatus("Available");
    else setConnectorStatus(`Unavailable: ${s.reason}`);
  };

  React.useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConnect = async () => {
    setBusy(true);
    try {
      const res = await requestPermissions();
      if (!res.granted) {
        Alert.alert("Permissions not granted", res.reason ?? "");
        return;
      }
      Alert.alert("Connected", "Permissions granted.");
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const onSyncLast24h = async () => {
    setBusy(true);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      const read = await readLast24h({ start, end });

      if (read.unavailable) {
        Alert.alert("Unavailable", read.unavailable);
        return;
      }

      if (!read.samples.length) {
        Alert.alert("No data", "No samples found in the last 24h.");
        return;
      }

      const up = await uploadToBackend({ userId, storageMode, samples: read.samples });
      Alert.alert("Sync complete", `Uploaded: ${up.uploaded}. Skipped: ${up.skipped}.`);
    } catch (e: any) {
      Alert.alert("Sync failed", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <Card>
          <Text style={styles.cardTitle}>Device user id</Text>
          <Text style={styles.body}>
            This is used to associate your samples in the MVP (until we add login).
          </Text>
          <Text style={styles.mono}>{userId}</Text>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Data storage consent</Text>
          <Text style={styles.body}>
            Choose what gets sent to the backend. You can change this any time.
          </Text>
          <View style={styles.row}>
            <Chip label="Raw" selected={storageMode === "raw"} onPress={() => setStorageMode("raw")} />
            <Chip
              label="Aggregated"
              selected={storageMode === "aggregated"}
              onPress={() => setStorageMode("aggregated")}
            />
            <Chip
              label="Local only"
              selected={storageMode === "local_only"}
              onPress={() => setStorageMode("local_only")}
            />
          </View>
          <Text style={styles.note}>
            Note: In Phase 1, “Aggregated” stores to a separate collection but uses the same charting.
          </Text>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Activity metric for correlation</Text>
          <Text style={styles.body}>
            Default is Steps (count/min). We’ll add Move ring equivalents in Phase 2 via HealthKit/Health
            Connect.
          </Text>
          <View style={styles.row}>
            <Chip
              label="Steps/min"
              selected={activityMetric === "steps_per_min"}
              onPress={() => setActivityMetric("steps_per_min")}
            />
            <Chip
              label="Exercise minutes"
              selected={activityMetric === "exercise_minutes"}
              onPress={() => setActivityMetric("exercise_minutes")}
            />
          </View>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Health connectors</Text>
          <Text style={styles.body}>
            iOS uses Apple HealthKit. Android uses Health Connect.
          </Text>
          <Text style={styles.connectorRow}>Status: {connectorStatus}</Text>

          <View style={{ height: 12 }} />

          <View style={styles.actionRow}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={refreshStatus}
              disabled={busy}
              style={[styles.secondaryBtn, busy ? styles.btnDisabled : undefined]}
            >
              <Text style={styles.secondaryBtnText}>Refresh</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={onConnect}
              disabled={busy}
              style={[styles.secondaryBtn, busy ? styles.btnDisabled : undefined]}
            >
              <Text style={styles.secondaryBtnText}>Request permissions</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 12 }} />

          <TouchableOpacity
            accessibilityRole="button"
            onPress={onSyncLast24h}
            disabled={busy || !isNative}
            style={[styles.primaryBtn, (busy || !isNative) ? styles.btnDisabled : undefined]}
          >
            {busy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.primaryBtnText}>Sync last 24h to dashboard</Text>
            )}
          </TouchableOpacity>

          {!isNative ? (
            <Text style={styles.note}>
              Connectors aren’t available in the web preview. To use HealthKit/Health Connect you’ll need a dev build.
            </Text>
          ) : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 12,
  },
  body: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  mono: {
    fontFamily: "monospace",
    color: colors.text,
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  note: {
    marginTop: 12,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
  },
  connectorRow: {
    color: colors.textDim,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  btnDisabled: {
    opacity: 0.6,
  },

});
