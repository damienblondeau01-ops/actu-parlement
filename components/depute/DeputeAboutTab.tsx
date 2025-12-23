import React from "react";
import { View, Text } from "react-native";

type DeputeRow = {
  age: number | string | null;
  profession: string | null;
  resume: string | null;
  bio: string | null;
  circonscription: string | null;
  departementNom: string | null;
  departementCode: string | null;
};

type Props = {
  depute: DeputeRow;
  circoLabel: string | null;
  styles: any;
};

export default function DeputeAboutTab({ depute, circoLabel, styles }: Props) {
  return (
    <View style={styles.tabCard}>
      <Text style={styles.sectionTitle}>À propos</Text>

      {depute.resume ? (
        <Text style={styles.paragraph}>{depute.resume}</Text>
      ) : depute.bio ? (
        <Text style={styles.paragraph}>{depute.bio}</Text>
      ) : (
        <Text style={styles.paragraphSecondary}>
          Ce député siège à l’Assemblée nationale. La synthèse détaillée de son
          parcours sera bientôt disponible.
        </Text>
      )}

      <View style={styles.aboutInfoCard}>
        {depute.age && (
          <View style={styles.aboutInfoRow}>
            <Text style={styles.aboutInfoLabel}>Âge</Text>
            <Text style={styles.aboutInfoValue}>{depute.age} ans</Text>
          </View>
        )}

        {depute.profession && (
          <View style={styles.aboutInfoRow}>
            <Text style={styles.aboutInfoLabel}>Profession</Text>
            <Text style={styles.aboutInfoValue}>{depute.profession}</Text>
          </View>
        )}

        {(circoLabel || depute.departementNom || depute.departementCode) && (
          <View style={styles.aboutInfoRow}>
            <Text style={styles.aboutInfoLabel}>Circonscription</Text>
            <Text style={styles.aboutInfoValue}>
              {circoLabel ??
                `${depute.departementNom ?? ""}${
                  depute.departementCode
                    ? ` (${depute.departementCode})`
                    : ""
                }`.trim()}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
