import React from "react";
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from "react-native";
import { colors } from "../theme";

export function Chip({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : undefined, style]}
    >
      <Text style={[styles.text, selected ? styles.textSelected : undefined]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    minHeight: 44,
    justifyContent: "center",
  },
  chipSelected: {
    backgroundColor: "rgba(124,92,255,0.18)",
    borderColor: "rgba(124,92,255,0.5)",
  },
  text: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  textSelected: {
    color: colors.accent,
  },
});
