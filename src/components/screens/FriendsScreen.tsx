"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, ChevronRight, Search, Star, Users } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { friendsService } from "../../middleware/services/service-factory";
import { closeFriendsService } from "../../middleware/services/service-factory";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { logBackendError } from "@/utils/backendErrors";
import styles from "./FriendsScreen.module.css";

interface FriendsScreenProps {
  onBack: () => void;
  onNavigateToProfile?: (userId: string) => void;
}

export function FriendsScreen({ onBack, onNavigateToProfile }: FriendsScreenProps) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"friends" | "close-friends">("friends");
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [closeFriendsList, setCloseFriendsList] = useState<any[]>([]);
  const [loadingCloseFriends, setLoadingCloseFriends] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleFriends = friendsList.filter((friend) => {
    if (!normalizedSearch) return true;
    const searchable = [friend.displayName, friend.display_name, friend.nickname, friend.username]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(normalizedSearch);
  });
  const visibleCloseFriends = closeFriendsList.filter((friend) => {
    if (!normalizedSearch) return true;
    const searchable = [friend.displayName, friend.display_name, friend.nickname, friend.username]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(normalizedSearch);
  });
  const circlePreview = activeTab === "friends" ? friendsList : closeFriendsList;

  // Load friends when component mounts
  useEffect(() => {
    if (!user?.id) return;

    const loadFriends = async () => {
      setLoadingFriends(true);
      try {
        const response = await friendsService.getFriends(user.id);
        if (response.success && response.friends) {
          console.log("🔍 Raw friends from service:", response.friends.map((f: any) => ({
            id: f?.id,
            userId: f?.userId,
            username: f?.username,
            displayName: f?.displayName
          })));
          
          // Deduplicate friends based on userId/id, with username as fallback
          const uniqueFriendsMap = new Map<string, any>();
          
          for (const friend of response.friends) {
            const key = friend?.userId || friend?.id || friend?.username;
            if (key && !uniqueFriendsMap.has(key)) {
              uniqueFriendsMap.set(key, friend);
            } else if (key) {
              console.log("⚠️ Duplicate friend detected:", key, friend);
            }
          }
          
          const uniqueFriends = Array.from(uniqueFriendsMap.values());
          console.log("✅ Deduplicated friends count:", uniqueFriends.length, "from", response.friends.length);
          
          setFriendsList(uniqueFriends);
        } else {
          setFriendsList([]);
        }
      } catch (error) {
        logBackendError("Error loading friends:", error);
        setFriendsList([]);
      } finally {
        setLoadingFriends(false);
      }
    };

    loadFriends();
  }, [user?.id]);

  // Load close friends when component mounts
  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;

    const loadCloseFriends = async () => {
      setLoadingCloseFriends(true);
      try {
        const response = await closeFriendsService.getCloseFriends(user.id);
        if (!isMounted) return;
        setCloseFriendsList(response.success ? response.friends || [] : []);
      } catch (error) {
        logBackendError("Error loading close friends:", error);
        if (isMounted) {
          setCloseFriendsList([]);
        }
      } finally {
        if (isMounted) {
          setLoadingCloseFriends(false);
        }
      }
    };

    loadCloseFriends();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  return (
    <div
      className={styles.screen}
      style={{
        minHeight: "100dvh",
        background: "#0a0a0a",
        fontFamily: "var(--font-ui)",
        paddingBottom: "calc(20px + var(--safe-area-bottom))",
      }}
    >
      {/* Header */}
      <div
        className={styles.header}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "calc(16px + var(--safe-area-top)) 20px 16px",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(10, 10, 10, 0.95)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button
          className={styles.backButton}
          onClick={onBack}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            border: "none",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div className={styles.headerCopy}>
          <h1
            className={styles.title}
            style={{
            color: "#fff",
            fontSize: "18px",
            fontWeight: 700,
            margin: 0,
            }}
          >
            {activeTab === "friends" ? "Your circle" : "Close circle"}
          </h1>
          <span className={styles.subtitle}>real people, no noise</span>
        </div>
        <div style={{ width: "36px" }} />
      </div>

      {/* Tabs */}
      <div
        className={styles.tabs}
        style={{
          display: "flex",
          padding: "12px 20px",
          gap: "8px",
          background: "rgba(10, 10, 10, 0.95)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          position: "sticky",
          top: "calc(69px + var(--safe-area-top))",
          zIndex: 9,
        }}
      >
        <button
          className={`${styles.tab} ${activeTab === "friends" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("friends")}
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: "14px",
            border: "none",
            background: activeTab === "friends"
              ? "rgba(251,113,133,0.15)"
              : "rgba(255,255,255,0.04)",
            color: activeTab === "friends" ? "#fb7185" : "rgba(255,255,255,0.6)",
            fontWeight: 600,
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s",
          }}
        >
          <Users size={16} />
          Friends ({friendsList.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === "close-friends" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("close-friends")}
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: "14px",
            border: "none",
            background: activeTab === "close-friends"
              ? "rgba(250,204,21,0.15)"
              : "rgba(255,255,255,0.04)",
            color: activeTab === "close-friends" ? "#facc15" : "rgba(255,255,255,0.6)",
            fontWeight: 600,
            fontSize: "14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s",
          }}
        >
          <Star size={16} />
          Close Friends ({closeFriendsList.length})
        </button>
      </div>

      {/* Content */}
      <div className={styles.content} style={{ padding: "16px 20px" }}>
        <div className={styles.circleSummary}>
          <div className={styles.circleSummaryCopy}>
            <span className={styles.eyebrow}>{activeTab === "friends" ? "your people" : "inner circle"}</span>
            <strong>{circlePreview.length} {circlePreview.length === 1 ? "person" : "people"} in the orbit</strong>
            <span>Only the people you choose see the real stuff.</span>
          </div>
          <div className={styles.circlePreview} aria-hidden="true">
            {circlePreview.slice(0, 5).map((friend, index) => (
              <span key={friend.userId || friend.id || index} className={styles.previewAvatar}>
                <Avatar
                  src={friend.avatarUrl || friend.avatar_url || ""}
                  alt=""
                  size="sm"
                  userId={friend.userId || friend.id}
                />
              </span>
            ))}
          </div>
        </div>
        <label className={styles.searchShell}>
          <Search size={16} aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={activeTab === "friends" ? "Find someone in your circle" : "Find a close friend"}
            aria-label="Search friends"
          />
        </label>
        {activeTab === "friends" ? (
          <>
            {loadingFriends ? (
              <div
                className={styles.emptyState}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 14,
                }}
              >
                Loading friends...
              </div>
            ) : friendsList.length === 0 ? (
              <div
                className={styles.emptyState}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 14,
                }}
              >
                No friends yet
              </div>
            ) : visibleFriends.length === 0 ? (
              <div className={styles.emptyState}>
                No people match: {searchQuery}
              </div>
            ) : (
              <div className={styles.list} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {visibleFriends.map((friend, i) => (
                  <div
                    className={styles.friendCard}
                    key={`friend-${friend.id || friend.userId}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "12px 16px",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.03)",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onClick={() => {
                      if (onNavigateToProfile && (friend.userId || friend.id)) {
                        onNavigateToProfile(friend.userId || friend.id);
                      }
                    }}
                  >
                    <div className={styles.avatarWrap} style={{ flexShrink: 0 }}>
                      <Avatar
                        src={friend.avatarUrl || friend.avatar_url || ""}
                        alt={
                          friend.displayName ||
                          friend.nickname ||
                          friend.display_name ||
                          friend.username
                        }
                        size="lg"
                        userId={friend.userId || friend.id}
                      />
                    </div>
                    <div className={styles.copy} style={{ flex: 1, minWidth: 0 }}>
                      <p
                        className={styles.friendName}
                        style={{
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 15,
                          margin: 0,
                        }}
                      >
                        {friend.displayName ||
                          friend.nickname ||
                          friend.display_name ||
                          friend.username}
                      </p>
                      <p
                        className={styles.friendHandle}
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: 13,
                          margin: "2px 0 0",
                        }}
                      >
                        @{String(friend.username || "unknown").replace(/^@/, "")}
                      </p>
                    </div>
                    <ChevronRight className={styles.chevron} size={18} />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {loadingCloseFriends ? (
              <div
                className={styles.emptyState}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 14,
                }}
              >
                Loading close friends...
              </div>
            ) : closeFriendsList.length === 0 ? (
              <div
                className={styles.emptyState}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px 20px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                Add trusted friends from their profile to see them here.
              </div>
            ) : visibleCloseFriends.length === 0 ? (
              <div className={styles.emptyState}>
                No close friend matches: {searchQuery}
              </div>
            ) : (
              <div className={styles.list} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {visibleCloseFriends.map((friend) => (
                  <div
                    className={styles.closeFriendCard}
                    key={friend.userId || friend.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      borderRadius: "16px",
                      background: "rgba(250,204,21,0.05)",
                      border: "1px solid rgba(250,204,21,0.1)",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onClick={() => {
                      if (onNavigateToProfile && friend.userId) {
                        onNavigateToProfile(friend.userId);
                      }
                    }}
                  >
                    <div className={styles.avatarWrap}>
                      <Avatar
                        src={friend.avatarUrl || ""}
                        alt={friend.displayName || friend.username}
                        size="md"
                        userId={friend.userId}
                      />
                    </div>
                    <div className={styles.copy} style={{ flex: 1, minWidth: 0 }}>
                      <p
                        className={styles.friendName}
                        style={{
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 15,
                          margin: 0,
                        }}
                      >
                        {friend.displayName || friend.username}
                      </p>
                      <p
                        className={styles.friendHandle}
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: 12,
                          margin: "2px 0 0",
                        }}
                      >
                        @{String(friend.username || "unknown").replace(/^@/, "")}
                      </p>
                    </div>
                    <ChevronRight className={styles.chevron} size={18} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
