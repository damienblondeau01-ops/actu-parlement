// src/components/ui/Screen.tsx
import React from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { theme } from '../../theme';

type ScreenProps = {
  children: React.ReactNode;
  scrollable?: boolean;
};

export function Screen({ children, scrollable = true }: ScreenProps) {
  const Container = scrollable ? ScrollView : View;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Container
        contentContainerStyle={scrollable ? styles.contentContainer : undefined}
        style={!scrollable ? styles.content : undefined}
      >
        {children}
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
});
