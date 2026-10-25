
import { CameraView, useCameraPermissions } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { registerAttendance } from '@/lib/attendance';
import { useUserRole } from '@/lib/useUserRole';

const COLORS = {
  background: '#F8F7FC',
  white: '#FFFFFF',
  purple: '#6444E8',
  darkPurple: '#352080',
  lightPurple: '#EEE9FF',
  text: '#191535',
  muted: '#77748D',
  border: '#ECEAF5',
  green: '#16815A',
  lightGreen: '#E3F7EC',
  red: '#C62828',
  lightRed: '#FFF0F0',
};

export default function ScanScreen() {
  const {
    user,
    authLoading,
    roleLoading,
    isStudent,
  } = useUserRole();

  const [permission, requestPermission] =
    useCameraPermissions();

  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Prevent multiple attendance requests from one QR scan.
  const scanLocked = useRef(false);

  const handleBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (!isStudent || scanLocked.current) {
        return;
      }

      scanLocked.current = true;
      setScanned(true);
      setProcessing(true);
      setMessage(null);
      setSuccess(false);

      if (!user?.id) {
        setMessage(
          'Your student session is unavailable. Please sign in again.'
        );
        setSuccess(false);
        setProcessing(false);
        return;
      }

      try {
        const result = await registerAttendance(
          data,
          user.id
        );

        setMessage(result.message);
        setSuccess(result.success);
      } catch (error) {
        console.error('Attendance scan failed:', error);

        setMessage(
          'Unable to record attendance. Please check your connection and try again.'
        );
        setSuccess(false);
      } finally {
        setProcessing(false);
      }
    },
    [isStudent, user?.id]
  );

  const handleScanAgain = () => {
    setScanned(false);
    setProcessing(false);
    setMessage(null);
    setSuccess(false);
    scanLocked.current = false;
  };

  if (authLoading || roleLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={COLORS.purple}
        />

        <Text style={styles.centerTitle}>
          Loading Scanner
        </Text>

        <Text style={styles.centerSubtitle}>
          Checking student access...
        </Text>
      </View>
    );
  }

  if (!isStudent) {
    return (
      <View style={styles.center}>
        <View style={styles.centerIcon}>
          <Ionicons
            name="lock-closed-outline"
            size={36}
            color={COLORS.purple}
          />
        </View>

        <Text style={styles.centerTitle}>
          Student Access Only
        </Text>

        <Text style={styles.centerSubtitle}>
          QR attendance scanning is available only
          to users with the student role.
        </Text>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={COLORS.purple}
        />

        <Text style={styles.centerTitle}>
          Loading Camera
        </Text>

        <Text style={styles.centerSubtitle}>
          Preparing your QR scanner...
        </Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}>
            <Ionicons
              name="camera-outline"
              size={40}
              color={COLORS.purple}
            />
          </View>

          <Text style={styles.permissionTitle}>
            Camera Access Required
          </Text>

          <Text style={styles.permissionText}>
            QRR KOP needs camera access to scan
            the attendance QR code provided
            by your teacher.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.permissionButton,
              pressed && styles.pressed,
            ]}
            onPress={() => {
              void requestPermission();
            }}
            accessibilityRole="button"
          >
            <Ionicons
              name="camera-outline"
              size={21}
              color={COLORS.white}
            />

            <Text style={styles.permissionButtonText}>
              Grant Camera Permission
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Purple header */}
      <View style={styles.header}>
        <View style={styles.headerDecoration} />

        <View style={styles.headerTopRow}>
          <View style={styles.headerIcon}>
            <Ionicons
              name="scan-outline"
              size={27}
              color={COLORS.white}
            />
          </View>

          <View style={styles.studentBadge}>
            <Ionicons
              name="school-outline"
              size={14}
              color={COLORS.white}
            />
            <Text style={styles.studentBadgeText}>
              STUDENT
            </Text>
          </View>
        </View>

        <Text style={styles.headerEyebrow}>
          QRR KOP WORKSPACE
        </Text>

        <Text style={styles.headerTitle}>
          Scan Attendance
        </Text>

        <Text style={styles.headerSubtitle}>
          Check in to your class by scanning
          your teacher's QR code.
        </Text>
      </View>

      {/* Instructions */}
      <View style={styles.instructionCard}>
        <View style={styles.instructionIcon}>
          <Ionicons
            name="information-circle-outline"
            size={25}
            color={COLORS.purple}
          />
        </View>

        <View style={styles.instructionContent}>
          <Text style={styles.instructionTitle}>
            Ready to check in?
          </Text>

          <Text style={styles.instructionText}>
            Position the QR code inside the
            camera frame to record attendance.
          </Text>
        </View>
      </View>

      {/* Scanner */}
      <View style={styles.scannerCard}>
        <View style={styles.scannerHeader}>
          <View style={styles.scannerHeading}>
            <View style={styles.scannerHeadingIcon}>
              <Ionicons
                name="qr-code-outline"
                size={20}
                color={COLORS.purple}
              />
            </View>

            <View>
              <Text style={styles.scannerTitle}>
                QR Code Scanner
              </Text>
              <Text style={styles.scannerSubtitle}>
                Live camera
              </Text>
            </View>
          </View>

          <View style={styles.cameraStatus}>
            <View
              style={[
                styles.statusDot,
                scanned && styles.statusDotPaused,
              ]}
            />

            <Text style={styles.cameraStatusText}>
              {scanned ? 'Paused' : 'Ready'}
            </Text>
          </View>
        </View>

        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={
              scanned
                ? undefined
                : handleBarcodeScanned
            }
          />

          {/* Scanner frame overlay */}
          <View
            pointerEvents="none"
            style={styles.cameraOverlay}
          >
            <View style={styles.scanFrame}>
              <View
                style={[
                  styles.corner,
                  styles.topLeft,
                ]}
              />

              <View
                style={[
                  styles.corner,
                  styles.topRight,
                ]}
              />

              <View
                style={[
                  styles.corner,
                  styles.bottomLeft,
                ]}
              />

              <View
                style={[
                  styles.corner,
                  styles.bottomRight,
                ]}
              />

              {!scanned && (
                <View style={styles.frameCenter}>
                  <Ionicons
                    name="qr-code-outline"
                    size={50}
                    color="rgba(255,255,255,0.50)"
                  />
                </View>
              )}
            </View>
          </View>

          <View
            pointerEvents="none"
            style={styles.cameraBottomLabel}
          >
            <Ionicons
              name={
                scanned
                  ? 'checkmark-circle-outline'
                  : 'scan-outline'
              }
              size={17}
              color={COLORS.white}
            />

            <Text style={styles.cameraBottomText}>
              {scanned
                ? 'Scan completed'
                : 'Align the QR code inside the frame'}
            </Text>
          </View>
        </View>

        {/* Scanner status */}
        <View style={styles.scanStatus}>
          {processing ? (
            <>
              <ActivityIndicator
                size="small"
                color={COLORS.purple}
              />

              <Text style={styles.scanStatusText}>
                Checking attendance...
              </Text>
            </>
          ) : scanned ? (
            <>
              <Ionicons
                name={
                  success
                    ? 'checkmark-circle'
                    : 'alert-circle-outline'
                }
                size={23}
                color={
                  success
                    ? COLORS.green
                    : COLORS.red
                }
              />

              <Text style={styles.scanStatusText}>
                {success
                  ? 'Attendance processed'
                  : 'Scan finished'}
              </Text>
            </>
          ) : (
            <>
              <Ionicons
                name="radio-button-on-outline"
                size={23}
                color={COLORS.purple}
              />

              <Text style={styles.scanStatusText}>
                Waiting for QR code...
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Scan result */}
      {scanned && !processing && message ? (
        <View
          style={[
            styles.resultCard,
            success
              ? styles.successCard
              : styles.errorCard,
          ]}
        >
          <View
            style={[
              styles.resultIcon,
              success
                ? styles.successIcon
                : styles.errorIcon,
            ]}
          >
            <Ionicons
              name={
                success
                  ? 'checkmark-circle'
                  : 'alert-circle'
              }
              size={30}
              color={
                success
                  ? COLORS.green
                  : COLORS.red
              }
            />
          </View>

          <Text style={styles.resultTitle}>
            {success
              ? 'Attendance Successful!'
              : 'Attendance Not Recorded'}
          </Text>

          <Text style={styles.resultMessage}>
            {message}
          </Text>
        </View>
      ) : null}

      {/* Scan again */}
      {scanned && !processing ? (
        <Pressable
          style={({ pressed }) => [
            styles.scanAgainButton,
            pressed && styles.pressed,
          ]}
          onPress={handleScanAgain}
          accessibilityRole="button"
        >
          <Ionicons
            name="refresh-outline"
            size={22}
            color={COLORS.white}
          />

          <Text style={styles.scanAgainText}>
            Scan Again
          </Text>
        </Pressable>
      ) : null}

      {/* Help */}
      <View style={styles.helpCard}>
        <View style={styles.helpHeading}>
          <Ionicons
            name="help-circle-outline"
            size={22}
            color={COLORS.purple}
          />
          <Text style={styles.helpTitle}>
            How to Scan
          </Text>
        </View>

        <View style={styles.helpRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNumber}>1</Text>
          </View>

          <Text style={styles.helpText}>
            Ask your teacher to display the
            attendance QR code.
          </Text>
        </View>

        <View style={styles.helpRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNumber}>2</Text>
          </View>

          <Text style={styles.helpText}>
            Position the QR code inside
            the camera frame.
          </Text>
        </View>

        <View style={styles.helpRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNumber}>3</Text>
          </View>

          <Text style={styles.helpText}>
            Wait for confirmation, then
            check your attendance history.
          </Text>
        </View>
      </View>

      <Text style={styles.footer}>
        QRR KOP • Smart Attendance System
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerIcon: {
    width: 80,
    height: 80,
    borderRadius: 25,
    backgroundColor: COLORS.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  centerTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  centerSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.muted,
    textAlign: 'center',
  },

  // Camera permissions
  permissionCard: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  permissionIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: COLORS.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 22,
  },
  permissionButton: {
    backgroundColor: COLORS.purple,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  permissionButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },

  // Purple header
  header: {
    backgroundColor: COLORS.purple,
    borderRadius: 25,
    padding: 23,
    marginBottom: 20,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: COLORS.darkPurple,
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },
  },
  headerDecoration: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: -95,
    top: -90,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.17)',
  },
  studentBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#E3D9FF',
    marginBottom: 9,
  },
  headerTitle: {
    fontSize: 27,
    fontWeight: '900',
    color: COLORS.white,
  },
  headerSubtitle: {
    fontSize: 13,
    lineHeight: 21,
    color: '#EAE4FF',
    marginTop: 8,
    maxWidth: 310,
  },

  // Instruction card
  instructionCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightPurple,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    marginBottom: 20,
  },
  instructionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionContent: {
    flex: 1,
  },
  instructionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.darkPurple,
    marginBottom: 5,
  },
  instructionText: {
    fontSize: 12,
    lineHeight: 19,
    color: COLORS.darkPurple,
  },

  // Scanner
  scannerCard: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 18,
    elevation: 1,
    shadowColor: COLORS.darkPurple,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  scannerHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scannerHeadingIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: COLORS.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  scannerSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 3,
  },
  cameraStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.background,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.green,
  },
  statusDotPaused: {
    backgroundColor: '#E0A13C',
  },
  cameraStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
  },
  cameraContainer: {
    height: 350,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#141321',
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 235,
    height: 235,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#C9BFFF',
    borderWidth: 5,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 15,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 15,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 15,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 15,
  },
  frameCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBottomLabel: {
    position: 'absolute',
    bottom: 15,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cameraBottomText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  scanStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 16,
    paddingBottom: 5,
  },
  scanStatusText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Results
  resultCard: {
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 18,
  },
  successCard: {
    backgroundColor: COLORS.lightGreen,
    borderColor: '#C6EBD5',
  },
  errorCard: {
    backgroundColor: COLORS.lightRed,
    borderColor: '#F3D2D2',
  },
  resultIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  successIcon: {
    backgroundColor: '#D1F1DE',
  },
  errorIcon: {
    backgroundColor: '#FCE0E0',
  },
  resultTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  resultMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.text,
    textAlign: 'center',
  },
  scanAgainButton: {
    backgroundColor: COLORS.purple,
    borderRadius: 15,
    paddingVertical: 17,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  scanAgainText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
  },

  // Help
  helpCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 19,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  helpHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 17,
  },
  helpTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 15,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: COLORS.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    color: COLORS.purple,
    fontSize: 14,
    fontWeight: '800',
  },
  helpText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.muted,
  },
  footer: {
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 25,
  },
  pressed: {
    opacity: 0.85,
  },
});
