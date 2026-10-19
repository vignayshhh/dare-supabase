export class UserProfileEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly username: string,
    public readonly nickname: string,
    public readonly displayName: string | null,
    public readonly bio: string | null,
    public readonly avatarUrl: string | null,
    public readonly visibility: "PUBLIC" | "PRIVATE",
    public readonly is18Plus: boolean,
    public readonly consentAccepted: boolean,
    public readonly daresCompleted: number,
    public readonly daresRefused: number,
    public readonly createdAt: string,
    public readonly updatedAt: string,
  ) {}

  static create(data: {
    id: string;
    userId: string;
    username: string;
    nickname: string;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    visibility: "PUBLIC" | "PRIVATE";
    is18Plus: boolean;
    consentAccepted: boolean;
    daresCompleted: number;
    daresRefused: number;
    createdAt: string;
    updatedAt: string;
  }): UserProfileEntity {
    return new UserProfileEntity(
      data.id,
      data.userId,
      data.username,
      data.nickname,
      data.displayName,
      data.bio,
      data.avatarUrl,
      data.visibility,
      data.is18Plus,
      data.consentAccepted,
      data.daresCompleted,
      data.daresRefused,
      data.createdAt,
      data.updatedAt,
    );
  }

  isPublic(): boolean {
    return this.visibility === "PUBLIC";
  }

  isPrivate(): boolean {
    return this.visibility === "PRIVATE";
  }

  canBeViewedBy(viewerId?: string): boolean {
    if (this.isPublic()) {
      return true;
    }

    if (this.isPrivate()) {
      return viewerId === this.userId;
    }

    return false;
  }

  canReceiveDares(): boolean {
    return this.is18Plus && this.consentAccepted;
  }

  updateProfile(updates: {
    nickname?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    visibility?: "PUBLIC" | "PRIVATE";
  }): UserProfileEntity {
    return new UserProfileEntity(
      this.id,
      this.userId,
      this.username,
      updates.nickname ?? this.nickname,
      updates.displayName ?? this.displayName,
      updates.bio ?? this.bio,
      updates.avatarUrl ?? this.avatarUrl,
      updates.visibility ?? this.visibility,
      this.is18Plus,
      this.consentAccepted,
      this.daresCompleted,
      this.daresRefused,
      this.createdAt,
      new Date().toISOString(),
    );
  }

  incrementDaresCompleted(): UserProfileEntity {
    return new UserProfileEntity(
      this.id,
      this.userId,
      this.username,
      this.nickname,
      this.displayName,
      this.bio,
      this.avatarUrl,
      this.visibility,
      this.is18Plus,
      this.consentAccepted,
      this.daresCompleted + 1,
      this.daresRefused,
      this.createdAt,
      new Date().toISOString(),
    );
  }

  incrementDaresRefused(): UserProfileEntity {
    return new UserProfileEntity(
      this.id,
      this.userId,
      this.username,
      this.nickname,
      this.displayName,
      this.bio,
      this.avatarUrl,
      this.visibility,
      this.is18Plus,
      this.consentAccepted,
      this.daresCompleted,
      this.daresRefused + 1,
      this.createdAt,
      new Date().toISOString(),
    );
  }
}
