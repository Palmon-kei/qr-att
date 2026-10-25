
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/lib/useUserRole';
import type { Role } from '@/lib/profiles';

type ManagedUser = {
  id: string;
  full_name: string | null;
  role: Role;
  student_id: string | null;
  avatar_path: string | null;
  created_at: string;
};

type Filter = 'all' | Role;

const C = {
  purple: '#6444E8',
  darkPurple: '#352080',
  lightPurple: '#EEE9FF',
  background: '#F8F7FC',
  white: '#FFFFFF',
  text: '#191535',
  muted: '#77748D',
  border: '#ECEAF5',
  red: '#C62828',
  green: '#16815A',
  lightGreen: '#E3F7EC',
};

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Students', value: 'student' },
  { label: 'Teachers', value: 'teacher' },
  { label: 'Admins', value: 'admin' },
];

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return 'U';
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  return (
    words[0].charAt(0) +
    words[words.length - 1].charAt(0)
  ).toUpperCase();
}

function roleLabel(role: Role): string {
  if (role === 'admin') return 'Administrator';
  if (role === 'teacher') return 'Teacher';
  return 'Student';
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Unknown';

  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function UserAvatar({
  name,
  path,
  large = false,
}: {
  name: string;
  path: string | null;
  large?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const avatarUrl = path
    ? supabase.storage
        .from('avatars')
        .getPublicUrl(path).data.publicUrl
    : null;

  return (
    <View style={[styles.avatar, large && styles.avatarLarge]}>
      {avatarUrl && !imageFailed ? (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.avatarImage}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text
          style={[
            styles.avatarText,
            large && styles.avatarTextLarge,
          ]}
        >
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable>
        {value}
      </Text>
    </View>
  );
}

export default function UsersScreen() {
  const { user, isAdmin, roleLoading } = useUserRole();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] =
    useState<ManagedUser | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStudentId, setEditStudentId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!user?.id || !isAdmin) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);

      const allUsers: ManagedUser[] = [];
      const pageSize = 500;
      let start = 0;

      while (true) {
        const { data, error: queryError } = await supabase
          .from('profiles')
          .select(
            'id, full_name, role, student_id, avatar_path, created_at'
          )
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(start, start + pageSize - 1);

        if (queryError) {
          throw new Error(queryError.message);
        }

        const page = (data ?? []) as ManagedUser[];
        allUsers.push(...page);

        if (page.length < pageSize) break;
        start += pageSize;
      }

      setUsers(allUsers);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load registered users.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      if (roleLoading || !isAdmin) return;

      setLoading(true);
      void loadUsers();
    }, [roleLoading, isAdmin, loadUsers])
  );

  const refresh = () => {
    setRefreshing(true);
    void loadUsers();
  };

  const openDetails = (item: ManagedUser) => {
    setSelectedUser(item);
    setEditing(false);
  };

  const closeDetails = () => {
    if (saving) return;

    setSelectedUser(null);
    setEditing(false);
  };

  const startEditing = () => {
    if (!selectedUser) return;

    setEditName(selectedUser.full_name ?? '');
    setEditStudentId(selectedUser.student_id ?? '');
    setEditing(true);
  };

  const saveChanges = async () => {
    if (!selectedUser || !isAdmin || saving) return;

    const cleanName = editName.trim();
    const cleanStudentId = editStudentId.trim();

    if (!cleanName) {
      Alert.alert(
        'Missing Name',
        'Please enter a full name.'
      );
      return;
    }

    if (cleanName.length > 150) {
      Alert.alert(
        'Name Too Long',
        'The full name must be 150 characters or fewer.'
      );
      return;
    }

    if (
      selectedUser.role === 'student' &&
      cleanStudentId.length > 50
    ) {
      Alert.alert(
        'Student ID Too Long',
        'The Student ID must be 50 characters or fewer.'
      );
      return;
    }

    setSaving(true);

    try {
      // Keep the original database-protected update function.
      const { error: updateError } = await supabase.rpc(
        'admin_update_user_profile',
        {
          p_user_id: selectedUser.id,
          p_full_name: cleanName,
          p_student_id:
            selectedUser.role === 'student'
              ? cleanStudentId || null
              : null,
        }
      );

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Verify the saved profile against the database.
      const { data: saved, error: readError } = await supabase
        .from('profiles')
        .select(
          'id, full_name, role, student_id, avatar_path, created_at'
        )
        .eq('id', selectedUser.id)
        .single();

      if (readError || !saved) {
        throw new Error(
          readError?.message ??
            'Unable to verify the updated profile.'
        );
      }

      const updated = saved as ManagedUser;

      if (
        updated.full_name !== cleanName ||
        (selectedUser.role === 'student' &&
          (updated.student_id ?? '') !== cleanStudentId)
      ) {
        throw new Error(
          'The saved profile did not match the requested changes.'
        );
      }

      setUsers((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item
        )
      );

      setSelectedUser(updated);
      setEditing(false);

      Alert.alert(
        'Changes Saved',
        'The user profile was updated successfully.'
      );
    } catch (err) {
      Alert.alert(
        'Unable to Save',
        err instanceof Error
          ? err.message
          : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const normalizedSearch = search.trim().toLowerCase();

  const filteredUsers = users.filter((item) => {
    const matchesRole =
      filter === 'all' || item.role === filter;

    const matchesSearch =
      !normalizedSearch ||
      (item.full_name ?? '')
        .toLowerCase()
        .includes(normalizedSearch) ||
      (item.student_id ?? '')
        .toLowerCase()
        .includes(normalizedSearch);

    return matchesRole && matchesSearch;
  });

  const totalStudents = users.filter(
    (item) => item.role === 'student'
  ).length;

  const totalTeachers = users.filter(
    (item) => item.role === 'teacher'
  ).length;

  const totalAdmins = users.filter(
    (item) => item.role === 'admin'
  ).length;

  if (roleLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={C.purple}
        />
        <Text style={styles.message}>
          Checking administrator access...
        </Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <View style={styles.accessIcon}>
          <Ionicons
            name="lock-closed-outline"
            size={35}
            color={C.purple}
          />
        </View>

        <Text style={styles.accessTitle}>
          Access Denied
        </Text>

        <Text style={styles.message}>
          Only administrators can manage
          registered school accounts.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[C.purple]}
            tintColor={C.purple}
          />
        }
      >
        {/* Purple dashboard header */}
        <View style={styles.hero}>
          <View style={styles.heroDecoration} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroIcon}>
              <Ionicons
                name="people-outline"
                size={28}
                color={C.white}
              />
            </View>

            <View style={styles.adminBadge}>
              <Ionicons
                name="shield-checkmark-outline"
                size={14}
                color={C.white}
              />

              <Text style={styles.adminBadgeText}>
                ADMIN
              </Text>
            </View>
          </View>

          <Text style={styles.heroEyebrow}>
            QRR KOP WORKSPACE
          </Text>

          <Text style={styles.heroTitle}>
            User Management
          </Text>

          <Text style={styles.heroSubtitle}>
            View and manage registered school
            accounts in one place.
          </Text>
        </View>

        {/* User statistics */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeading}>
            <View style={styles.statsHeadingIcon}>
              <Ionicons
                name="analytics-outline"
                size={20}
                color={C.purple}
              />
            </View>

            <Text style={styles.statsHeadingText}>
              Account Overview
            </Text>
          </View>

          <View style={styles.totalUsersRow}>
            <View>
              <Text style={styles.totalUsersLabel}>
                TOTAL REGISTERED USERS
              </Text>

              <Text style={styles.totalUsersNumber}>
                {loading || error ? '—' : users.length}
              </Text>
            </View>

            <View style={styles.totalUsersIcon}>
              <Ionicons
                name="people"
                size={28}
                color={C.purple}
              />
            </View>
          </View>

          <View style={styles.statsDivider} />

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Ionicons
                name="school-outline"
                size={20}
                color={C.purple}
              />
              <Text style={styles.statNumber}>
                {loading || error ? '—' : totalStudents}
              </Text>
              <Text style={styles.statLabel}>
                Students
              </Text>
            </View>

            <View style={styles.statItem}>
              <Ionicons
                name="book-outline"
                size={20}
                color={C.purple}
              />
              <Text style={styles.statNumber}>
                {loading || error ? '—' : totalTeachers}
              </Text>
              <Text style={styles.statLabel}>
                Teachers
              </Text>
            </View>

            <View style={styles.statItem}>
              <Ionicons
                name="shield-outline"
                size={20}
                color={C.purple}
              />
              <Text style={styles.statNumber}>
                {loading || error ? '—' : totalAdmins}
              </Text>
              <Text style={styles.statLabel}>
                Admins
              </Text>
            </View>
          </View>
        </View>

        {/* Search */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Ionicons
              name="search-outline"
              size={19}
              color={C.purple}
            />
          </View>

          <Text style={styles.sectionTitle}>
            Find Accounts
          </Text>
        </View>

        <View style={styles.searchBox}>
          <Ionicons
            name="search-outline"
            size={21}
            color={C.muted}
          />

          <TextInput
            style={styles.searchInput}
            placeholder="Search name or Student ID"
            placeholderTextColor={C.muted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={C.muted}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Role filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.filterButton,
                filter === option.value &&
                  styles.filterButtonActive,
              ]}
              onPress={() => setFilter(option.value)}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.filterText,
                  filter === option.value &&
                    styles.filterTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Registered users */}
        <View style={styles.listHeading}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons
                name="people-outline"
                size={19}
                color={C.purple}
              />
            </View>

            <Text style={styles.sectionTitle}>
              Registered Users
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {loading || error
                ? '—'
                : `${filteredUsers.length} shown`}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerCard}>
            <ActivityIndicator
              size="large"
              color={C.purple}
            />
            <Text style={styles.message}>
              Loading registered users...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centerCard}>
            <Ionicons
              name="alert-circle-outline"
              size={35}
              color={C.red}
            />

            <Text style={styles.errorHeading}>
              Unable to Load Users
            </Text>

            <Text style={styles.message}>
              {error}
            </Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setLoading(true);
                void loadUsers();
              }}
            >
              <Ionicons
                name="refresh-outline"
                size={18}
                color={C.white}
              />

              <Text style={styles.retryText}>
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.centerCard}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="people-outline"
                size={37}
                color={C.purple}
              />
            </View>

            <Text style={styles.emptyTitle}>
              No Matching Users
            </Text>

            <Text style={styles.message}>
              Try a different name, Student ID,
              or account role filter.
            </Text>
          </View>
        ) : (
          <View style={styles.userList}>
            {filteredUsers.map((item) => {
              const name =
                item.full_name?.trim() || 'Unnamed User';

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.userRow}
                  onPress={() => openDetails(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`View details for ${name}`}
                >
                  <UserAvatar
                    name={name}
                    path={item.avatar_path}
                  />

                  <View style={styles.userInfo}>
                    <Text
                      style={styles.userName}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>

                    <Text
                      style={styles.userDetail}
                      numberOfLines={1}
                    >
                      {item.role === 'student'
                        ? `Student ID: ${
                            item.student_id || 'Not provided'
                          }`
                        : roleLabel(item.role)}
                    </Text>
                  </View>

                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>
                      {roleLabel(item.role)}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={C.muted}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={styles.footer}>
          QRR KOP • Administrator User Management
        </Text>
      </ScrollView>

      {/* User details and editing modal */}
      <Modal
        visible={selectedUser !== null}
        transparent
        animationType="slide"
        onRequestClose={closeDetails}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={
            Platform.OS === 'ios' ? 'padding' : undefined
          }
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeDetails}
          />

          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />

            <View style={styles.modalTop}>
              <Text style={styles.modalHeading}>
                {editing ? 'Edit User' : 'User Details'}
              </Text>

              <TouchableOpacity
                onPress={closeDetails}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Close user details"
              >
                <Ionicons
                  name="close-circle"
                  size={29}
                  color={C.muted}
                />
              </TouchableOpacity>
            </View>

            {selectedUser && (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalContent}
              >
                <View style={styles.modalIdentity}>
                  <UserAvatar
                    name={
                      selectedUser.full_name?.trim() ||
                      'Unnamed User'
                    }
                    path={selectedUser.avatar_path}
                    large
                  />

                  <Text style={styles.modalName}>
                    {selectedUser.full_name?.trim() ||
                      'Unnamed User'}
                  </Text>

                  <View style={styles.modalRoleBadge}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={15}
                      color={C.purple}
                    />

                    <Text style={styles.modalRoleText}>
                      {roleLabel(selectedUser.role)}
                    </Text>
                  </View>
                </View>

                {editing ? (
                  <>
                    <Text style={styles.inputLabel}>
                      Full Name
                    </Text>

                    <TextInput
                      style={styles.editInput}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Enter full name"
                      placeholderTextColor={C.muted}
                      maxLength={150}
                      editable={!saving}
                      autoCapitalize="words"
                    />

                    {selectedUser.role === 'student' && (
                      <>
                        <Text style={styles.inputLabel}>
                          Student ID
                        </Text>

                        <TextInput
                          style={styles.editInput}
                          value={editStudentId}
                          onChangeText={setEditStudentId}
                          placeholder="Enter Student ID"
                          placeholderTextColor={C.muted}
                          maxLength={50}
                          editable={!saving}
                          autoCapitalize="characters"
                        />
                      </>
                    )}

                    <View style={styles.readOnlyNotice}>
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={20}
                        color={C.purple}
                      />

                      <Text style={styles.readOnlyText}>
                        Account roles and authentication
                        details cannot be changed here.
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        saving && styles.disabledButton,
                      ]}
                      onPress={() => {
                        void saveChanges();
                      }}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator color={C.white} />
                      ) : (
                        <Ionicons
                          name="save-outline"
                          size={20}
                          color={C.white}
                        />
                      )}

                      <Text style={styles.primaryButtonText}>
                        {saving
                          ? 'Saving Changes...'
                          : 'Save Changes'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => setEditing(false)}
                      disabled={saving}
                    >
                      <Text style={styles.secondaryButtonText}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <DetailRow
                      label="Full Name"
                      value={
                        selectedUser.full_name ||
                        'Not provided'
                      }
                    />

                    <DetailRow
                      label="Account Role"
                      value={roleLabel(selectedUser.role)}
                    />

                    {selectedUser.role === 'student' && (
                      <DetailRow
                        label="Student ID"
                        value={
                          selectedUser.student_id ||
                          'Not provided'
                        }
                      />
                    )}

                    <DetailRow
                      label="Registration Date"
                      value={formatDate(
                        selectedUser.created_at
                      )}
                    />

                    <DetailRow
                      label="Account User ID"
                      value={selectedUser.id}
                    />

                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={startEditing}
                    >
                      <Ionicons
                        name="create-outline"
                        size={20}
                        color={C.white}
                      />

                      <Text style={styles.primaryButtonText}>
                        Edit User
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.readOnlyNotice}>
                      <Ionicons
                        name="information-circle-outline"
                        size={20}
                        color={C.purple}
                      />

                      <Text style={styles.readOnlyText}>
                        Only the full name and Student ID
                        can be edited. Account roles are
                        protected by Supabase.
                      </Text>
                    </View>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: 18,
    paddingBottom: 45,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: C.background,
  },
  accessIcon: {
    width: 82,
    height: 82,
    borderRadius: 25,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  accessTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: C.text,
    marginBottom: 7,
  },
  centerCard: {
    backgroundColor: C.white,
    padding: 30,
    borderRadius: 21,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  message: {
    marginTop: 12,
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: C.red,
    marginTop: 12,
  },

  // Purple header
  hero: {
    backgroundColor: C.purple,
    borderRadius: 25,
    padding: 23,
    marginBottom: 19,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: C.darkPurple,
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  heroDecoration: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: -95,
    top: -90,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.17)',
  },
  adminBadgeText: {
    color: C.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#E3D9FF',
    marginBottom: 9,
  },
  heroTitle: {
    color: C.white,
    fontSize: 27,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#EAE4FF',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 310,
  },

  // Statistics
  statsCard: {
    backgroundColor: C.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    marginBottom: 24,
  },
  statsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 19,
  },
  statsHeadingIcon: {
    width: 37,
    height: 37,
    borderRadius: 11,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsHeadingText: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
  },
  totalUsersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalUsersLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: C.muted,
  },
  totalUsersNumber: {
    fontSize: 38,
    fontWeight: '900',
    color: C.text,
    marginTop: 5,
  },
  totalUsersIcon: {
    width: 55,
    height: 55,
    borderRadius: 17,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: C.text,
  },
  statLabel: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '700',
  },

  // Search and filters
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
  },
  searchBox: {
    backgroundColor: C.white,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    marginTop: 13,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: C.text,
    fontSize: 14,
  },
  filterScroll: {
    marginTop: 15,
    marginBottom: 24,
  },
  filterRow: {
    gap: 9,
    paddingRight: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterButtonActive: {
    backgroundColor: C.purple,
    borderColor: C.purple,
  },
  filterText: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: C.white,
  },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  countBadge: {
    backgroundColor: C.lightPurple,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
  },
  countBadgeText: {
    color: C.purple,
    fontSize: 11,
    fontWeight: '800',
  },

  // User list
  userList: {
    backgroundColor: C.white,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    gap: 9,
  },
  avatar: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: C.lightPurple,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarLarge: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: C.purple,
    fontWeight: '800',
    fontSize: 16,
  },
  avatarTextLarge: {
    fontSize: 29,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
  },
  userDetail: {
    color: C.muted,
    fontSize: 11,
    marginTop: 5,
  },
  roleBadge: {
    backgroundColor: C.lightPurple,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  roleBadgeText: {
    color: C.purple,
    fontSize: 10,
    fontWeight: '800',
  },
  retryButton: {
    backgroundColor: C.purple,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  retryText: {
    color: C.white,
    fontWeight: '800',
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: C.lightPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 10,
  },

  // User details modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,15,45,0.45)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalCard: {
    backgroundColor: C.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '85%',
    padding: 22,
  },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: C.text,
  },
  modalContent: {
    paddingBottom: 24,
  },
  modalIdentity: {
    alignItems: 'center',
    marginBottom: 22,
    gap: 10,
  },
  modalName: {
    fontSize: 21,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
  },
  modalRoleBadge: {
    backgroundColor: C.lightPurple,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalRoleText: {
    color: C.darkPurple,
    fontSize: 12,
    fontWeight: '800',
  },
  detailRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  detailLabel: {
    color: C.muted,
    fontSize: 12,
    marginBottom: 6,
  },
  detailValue: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: C.text,
    marginBottom: 8,
  },
  editInput: {
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: C.text,
    fontSize: 14,
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 22,
  },
  primaryButtonText: {
    color: C.white,
    fontWeight: '800',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  secondaryButton: {
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 9,
  },
  secondaryButtonText: {
    color: C.muted,
    fontWeight: '700',
  },
  readOnlyNotice: {
    backgroundColor: C.lightPurple,
    borderRadius: 15,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
  },
  readOnlyText: {
    flex: 1,
    color: C.text,
    fontSize: 12,
    lineHeight: 19,
  },
  footer: {
    color: C.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 25,
  },
});
