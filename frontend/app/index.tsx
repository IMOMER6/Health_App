import React, { useMemo } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { LineChart, BarChart } from "react-native-gifted-charts";
import { format } from "date-fns";

import { api } from "../src/api/client";
import type { Dashboard24hResponse } from "../src/api/types";
import { useSettingsStore } from "../src/state/settingsStore";
import { useUserStore } from "../src/state/userStore";
import { Card } from "../src/ui/components/Card";
import { Screen } from "../src/ui/components/Screen";
import { colors } from "../src/ui/theme";

async function fetchDashboard(userId: string, activityMetric: string) {
  const res = await api.get<Dashboard24hResponse>("/dashboard/24h", {
    params: { user_id: userId, activity_metric: activityMetric },
  });
  return res.data;
}

export default function DashboardScreen() {
  const userId = useUserStore((s) => s.userId);
  const activityMetric = useSettingsStore((s) => s.activityMetric);

  const q = useQuery({
    queryKey: ["dashboard24h", userId, activityMetric],
    queryFn: () => fetchDashboard(userId, activityMetric),
  });

  const glucoseData = useMemo(() => {
    const pts = q.data?.series.blood_glucose ?? [];
    return pts.map((p) => ({
      value: p.mg_dl,
      label: format(new Date(p.t), "HH:mm"),
      date: p.t,
    }));
  }, [q.data?.series.blood_glucose]);

  const hrData = useMemo(() => {
    const pts = q.data?.series.heart_rate ?? [];
    return pts.map((p) => ({
      value: p.bpm,
      label: format(new Date(p.t), "HH:mm"),
      date: p.t,
    }));
  }, [q.data?.series.heart_rate]);

  const stepsData = useMemo(() => {
    const pts = q.data?.series.steps_per_min ?? [];
    return pts.map((p) => ({
      value: p.spm,
      label: format(new Date(p.t), "HH:mm"),
      date: p.t,
      frontColor: "rgba(124,92,255,0.8)",
    }));
  }, [q.data?.series.steps_per_min]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={q.isFetching}
            onRefresh={() => q.refetch()}
            tintColor={colors.text}
          />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>24h Overview</Text>
            <Text style={styles.sub}>
              User: <Text style={styles.mono}>{userId}</Text>
            </Text>
          </View>
          {q.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        </View>

        {!!q.error ? (
          <Card>
            <Text style={styles.cardTitle}>Couldn’t load dashboard</Text>
            <Text style={styles.cardBody}>Pull to refresh.</Text>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.cardTitle}>Blood Glucose (mg/dL)</Text>
          {glucoseData.length === 0 ? (
            <Text style={styles.empty}>No glucose data in the last 24h.</Text>
          ) : (
            <LineChart
              data={glucoseData}
              height={190}
              thickness={2}
              color={colors.good}
              hideDataPoints={false}
              dataPointsColor={colors.good}
              startFillColor={"rgba(36,209,143,0.18)"}
              endFillColor={"rgba(36,209,143,0.02)"}
              areaChart
              spacing={48}
              initialSpacing={12}
              hideRules
              yAxisTextStyle={{ color: colors.textDim, fontSize: 11 }}
              xAxisLabelTextStyle={{ color: colors.textDim, fontSize: 10 }}
              xAxisColor={colors.border}
              yAxisColor={colors.border}
              backgroundColor={colors.surface}
            />
          )}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Heart Rate (bpm)</Text>
          {hrData.length === 0 ? (
            <Text style={styles.empty}>No heart rate data in the last 24h.</Text>
          ) : (
            <LineChart
              data={hrData}
              height={190}
              thickness={2}
              color={colors.accent}
              hideDataPoints
              spacing={48}
              initialSpacing={12}
              hideRules
              yAxisTextStyle={{ color: colors.textDim, fontSize: 11 }}
              xAxisLabelTextStyle={{ color: colors.textDim, fontSize: 10 }}
              xAxisColor={colors.border}
              yAxisColor={colors.border}
              backgroundColor={colors.surface}
            />
          )}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Activity (Steps/min)</Text>
          {stepsData.length === 0 ? (
            <Text style={styles.empty}>No step data in the last 24h.</Text>
          ) : (
            <BarChart
              data={stepsData}
              height={190}
              barWidth={10}
              spacing={24}
              initialSpacing={12}
              yAxisTextStyle={{ color: colors.textDim, fontSize: 11 }}
              xAxisLabelTextStyle={{ color: colors.textDim, fontSize: 10 }}
              xAxisColor={colors.border}
              yAxisColor={colors.border}
              rulesColor={colors.border}
              noOfSections={4}
            />
          )}
          <Text style={styles.hint}>Correlation uses: +30 mg/dL within 60m & <100 steps over 20m.</Text>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Correlation Insights</Text>
          {q.data?.correlations?.length ? (
            <View style={{ gap: 12 }}>
              {q.data.correlations.slice(0, 5).map((c, idx) => (
                <View key={`${c.spike.start}-${idx}`} style={styles.insightRow}>
                  <Text style={styles.insightTitle}>
                    Glucose spike + inactivity overlap
                  </Text>
                  <Text style={styles.cardBody}>
                    Spike: {c.spike.delta_mg_dl} mg/dL (peak {c.spike.peak_mg_dl})
                  </Text>
                  <Text style={styles.cardBody}>
                    Dip: {format(new Date(c.activity_dip.start), "HH:mm")}–{format(
                      new Date(c.activity_dip.end),
                      "HH:mm"
                    )} ({c.activity_dip.steps ?? 0} steps)
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>
              No spike/dip correlations found in the last 24h.
            </Text>
          )}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  sub: {
    marginTop: 6,
    color: colors.textDim,
    fontSize: 12,
  },
  mono: {
    fontFamily: "monospace",
    color: colors.text,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 12,
  },
  cardBody: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
  },
  empty: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
  },
  hint: {
    marginTop: 12,
    color: colors.textDim,
    fontSize: 12,
  },
  insightRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.surface2,
  },
  insightTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },
});
