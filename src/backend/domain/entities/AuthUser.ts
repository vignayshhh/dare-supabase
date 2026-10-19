export class AuthUserEntity {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly username: string,
    public readonly nickname: string,
    public readonly displayName: string,
    public readonly is18Plus: boolean,
    public readonly consentAccepted: boolean,
    public readonly visibility: "PUBLIC" | "PRIVATE",
    public readonly daresCompleted: number,
    public readonly daresRefused: number,
    public readonly createdAt: string,
    public readonly updatedAt: string,
  ) {}

  static create(userData: {
    userId: string;
    email: string;
    username: string;
    nickname: string;
    displayName: string;
    is18Plus: boolean;
    consentAccepted: boolean;
    visibility: "PUBLIC" | "PRIVATE";
    daresCompleted: number;
    daresRefused: number;
    createdAt: string;
    updatedAt: string;
  }): AuthUserEntity {
    return new AuthUserEntity(
      userData.userId,
      userData.email,
      userData.username,
      userData.nickname,
      userData.displayName,
      userData.is18Plus,
      userData.consentAccepted,
      userData.visibility,
      userData.daresCompleted,
      userData.daresRefused,
      userData.createdAt,
      userData.updatedAt,
    );
  }

  canBeDared(): boolean {
    return this.is18Plus && this.consentAccepted;
  }

  updateProfile(updates: {
    displayName?: string;
    nickname?: string;
    visibility?: "PUBLIC" | "PRIVATE";
  }): AuthUserEntity {
    return new AuthUserEntity(
      this.userId,
      this.email,
      this.username,
      updates.nickname ?? this.nickname,
      updates.displayName ?? this.displayName,
      this.is18Plus,
      this.consentAccepted,
      updates.visibility ?? this.visibility,
      this.daresCompleted,
      this.daresRefused,
      this.createdAt,
      new Date().toISOString(),
    );
  }
}
