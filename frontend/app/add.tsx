import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { api } from "../src/api/client";
import type { IngestSample, SampleType } from "../src/api/types";
import { useSettingsStore } from "../src/state/settingsStore";
import { useUserStore } from "../src/state/userStore";
import { Card } from "../src/ui/components/Card";
import { Chip } from "../src/ui/components/Chip";
import { Field } from "../src/ui/components/Field";
import { Screen } from "../src/ui/components/Screen";
import { colors } from "../src/ui/theme";

const schema = z.object({
  timestamp: z.string().min(5, "Timestamp is required"),
  glucose: z.string().optional(),
  glucoseSource: z.enum(["cgm", "manual"]).optional(),
  bpm: z.string().optional(),
  systolic: z.string().optional(),
  diastolic: z.string().optional(),
  spm: z.string().optional(),
  exerciseMinutes: z.string().optional(),
  ecgAvgBpm: z.string().optional(),
  ecgClassification: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function isoNowLocalMinute() {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString();
}

function toNum(s?: string) {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export default function AddScreen() {
  const userId = useUserStore((s) => s.userId);
  const storageMode = useSettingsStore((s) => s.storageMode);

  const [type, setType] = useState<SampleType>("blood_glucose");
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      timestamp: isoNowLocalMinute(),
      glucoseSource: "manual",
    },
  });

  const ts = watch("timestamp");

  const samplePreview = useMemo(() => {
    const base: IngestSample = {
      type,
      timestamp: ts || isoNowLocalMinute(),
      data: {},
    };

    if (type === "blood_glucose") {
      base.data = {
        mg_dl: toNum(watch("glucose")) ?? 0,
        source: watch("glucoseSource") ?? "manual",
      };
    } else if (type === "heart_rate") {
      base.data = { bpm: toNum(watch("bpm")) ?? 0 };
    } else if (type === "blood_pressure") {
      base.data = {
        systolic_mmhg: toNum(watch("systolic")) ?? 0,
        diastolic_mmhg: toNum(watch("diastolic")) ?? 0,
      };
    } else if (type === "steps") {
      base.data = { spm: toNum(watch("spm")) ?? 0 };
    } else if (type === "exercise_minutes") {
      base.data = { minutes: toNum(watch("exerciseMinutes")) ?? 0 };
    } else if (type === "ecg") {
      base.data = {
        average_bpm: toNum(watch("ecgAvgBpm")),
        classification: watch("ecgClassification") || undefined,
      };
    }

    return base;
  }, [ts, type, watch]);

  const onSubmit = handleSubmit(async () => {
    setSubmitting(true);
    try {
      // Basic required field checks per type (schema is intentionally permissive)
      if (type === "blood_glucose" && toNum(watch("glucose")) == null) {
        Alert.alert("Missing value", "Enter glucose in mg/dL.");
        return;
      }
      if (type === "heart_rate" && toNum(watch("bpm")) == null) {
        Alert.alert("Missing value", "Enter heart rate in bpm.");
        return;
      }
      if (type === "blood_pressure") {
        if (toNum(watch("systolic")) == null || toNum(watch("diastolic")) == null) {
          Alert.alert("Missing value", "Enter systolic and diastolic in mmHg.");
          return;
        }
      }
      if (type === "steps" && toNum(watch("spm")) == null) {
        Alert.alert("Missing value", "Enter steps per minute.");
        return;
      }
      if (type === "exercise_minutes" && toNum(watch("exerciseMinutes")) == null) {
        Alert.alert("Missing value", "Enter exercise minutes.");
        return;
      }

      await api.post("/samples", {
        user_id: userId,
        storage_mode: storageMode,
        samples: [samplePreview],
      });

      Alert.alert("Saved", "Sample added to your 24h dashboard.");
      setValue("timestamp", isoNowLocalMinute());
    } catch (e: any) {
      Alert.alert("Couldn’t save", e?.message ?? "Please try again.");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Add sample</Text>
          <Text style={styles.sub}>
            Storage mode: <Text style={styles.mono}>{storageMode}</Text>
          </Text>

          <Card>
            <Text style={styles.cardTitle}>Metric</Text>
            <View style={styles.chips}>
              <Chip label="Glucose" selected={type === "blood_glucose"} onPress={() => setType("blood_glucose")} />
              <Chip label="Heart Rate" selected={type === "heart_rate"} onPress={() => setType("heart_rate")} />
              <Chip label="Blood Pressure" selected={type === "blood_pressure"} onPress={() => setType("blood_pressure")} />
              <Chip label="Steps/min" selected={type === "steps"} onPress={() => setType("steps")} />
              <Chip label="Exercise" selected={type === "exercise_minutes"} onPress={() => setType("exercise_minutes")} />
              <Chip label="ECG" selected={type === "ecg"} onPress={() => setType("ecg")} />
            </View>
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Timestamp</Text>
            <Controller
              control={control}
              name="timestamp"
              render={({ field: { value, onChange } }) => (
                <Field
                  label="ISO timestamp"
                  value={value}
                  onChangeText={onChange}
                  placeholder={new Date().toISOString()}
                  error={errors.timestamp?.message}
                />
              )}
            />
          </Card>

          <Card>
            <Text style={styles.cardTitle}>Values</Text>

            {type === "blood_glucose" ? (
              <View style={{ gap: 12 }}>
                <Controller
                  control={control}
                  name="glucose"
                  render={({ field: { value, onChange } }) => (
                    <Field
                      label="Glucose (mg/dL)"
                      value={value}
                      onChangeText={onChange}
                      keyboardType="numeric"
                      placeholder="e.g., 140"
                    />
                  )}
                />
                <Text style={styles.label}>Source</Text>
                <View style={styles.row}>
                  <Chip
                    label="Manual"
                    selected={watch("glucoseSource") === "manual"}
                    onPress={() => setValue("glucoseSource", "manual")}
                  />
                  <Chip
                    label="CGM"
                    selected={watch("glucoseSource") === "cgm"}
                    onPress={() => setValue("glucoseSource", "cgm")}
                  />
                </View>
              </View>
            ) : null}

            {type === "heart_rate" ? (
              <Controller
                control={control}
                name="bpm"
                render={({ field: { value, onChange } }) => (
                  <Field
                    label="Heart Rate (bpm)"
                    value={value}
                    onChangeText={onChange}
                    keyboardType="numeric"
                    placeholder="e.g., 72"
                  />
                )}
              />
            ) : null}

            {type === "blood_pressure" ? (
              <View style={{ gap: 12 }}>
                <Controller
                  control={control}
                  name="systolic"
                  render={({ field: { value, onChange } }) => (
                    <Field
                      label="Systolic (mmHg)"
                      value={value}
                      onChangeText={onChange}
                      keyboardType="numeric"
                      placeholder="e.g., 120"
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="diastolic"
                  render={({ field: { value, onChange } }) => (
                    <Field
                      label="Diastolic (mmHg)"
                      value={value}
                      onChangeText={onChange}
                      keyboardType="numeric"
                      placeholder="e.g., 80"
                    />
                  )}
                />
              </View>
            ) : null}

            {type === "steps" ? (
              <Controller
                control={control}
                name="spm"
                render={({ field: { value, onChange } }) => (
                  <Field
                    label="Steps per minute"
                    value={value}
                    onChangeText={onChange}
                    keyboardType="numeric"
                    placeholder="e.g., 0"
                  />
                )}
              />
            ) : null}

            {type === "exercise_minutes" ? (
              <Controller
                control={control}
                name="exerciseMinutes"
                render={({ field: { value, onChange } }) => (
                  <Field
                    label="Exercise minutes"
                    value={value}
                    onChangeText={onChange}
                    keyboardType="numeric"
                    placeholder="e.g., 10"
                  />
                )}
              />
            ) : null}

            {type === "ecg" ? (
              <View style={{ gap: 12 }}>
                <Controller
                  control={control}
                  name="ecgAvgBpm"
                  render={({ field: { value, onChange } }) => (
                    <Field
                      label="ECG average bpm (optional)"
                      value={value}
                      onChangeText={onChange}
                      keyboardType="numeric"
                      placeholder="e.g., 68"
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="ecgClassification"
                  render={({ field: { value, onChange } }) => (
                    <Field
                      label="Classification (optional)"
                      value={value}
                      onChangeText={onChange}
                      placeholder="e.g., sinus_rhythm"
                    />
                  )}
                />
              </View>
            ) : null}

            <View style={{ height: 16 }} />

            <TouchableOpacity
              accessibilityRole="button"
              onPress={onSubmit}
              disabled={submitting}
              style={[styles.primaryBtn, submitting ? styles.primaryBtnDisabled : undefined]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.primaryBtnText}>Save sample</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.preview} numberOfLines={5}>
              Preview: {JSON.stringify(samplePreview)}
            </Text>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
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
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  label: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  preview: {
    marginTop: 12,
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
  },
});
