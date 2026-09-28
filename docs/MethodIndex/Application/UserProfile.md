# Application / UserProfile 方法索引

> 由 `npm run docs:index` 自动生成，请勿手工编辑。

## UserProfileAccess

源码：`brian-backend/Application/UserProfile/access/UserProfileAccess.ts`

| 方法 | 签名 | 返回 | 说明 |
|------|------|------|------|
| `initialize` | `` | `Promise<void>` | — |
| `startAutoGeneration` | `` | `Promise<void>` | — |
| `stopAutoGeneration` | `` | `Promise<void>` | — |
| `configProfileDirection` | `i: ConfigProfileDirectionInput, o: ConfigProfileDirectionOutput, c: UserProfileContext,...` | `Promise<boolean>` | — |
| `deleteProfileDirection` | `i: DeleteProfileDirectionInput, o: DeleteProfileDirectionOutput, c: UserProfileContext,...` | `Promise<boolean>` | — |
| `soProfileDirection` | `i: GetProfileDirectionInput, o: GetProfileDirectionOutput, c: UserProfileContext, metri...` | `Promise<boolean>` | — |
| `soUserProfile` | `i: GetUserProfileInput, o: GetUserProfileOutput, c: UserProfileContext, metrics?: Metri...` | `Promise<boolean>` | — |
| `generateProfile` | `i: GenerateProfileInput, o: GenerateProfileOutput, c: UserProfileContext, metrics?: Met...` | `Promise<boolean>` | — |
| `saveUserPreference` | `i: SaveUserPreferenceInput, o: SaveUserPreferenceOutput, c: UserProfileContext, metrics...` | `Promise<boolean>` | — |
| `soProfileHistory` | `i: GetProfileHistoryInput, o: GetProfileHistoryOutput, c: UserProfileContext, metrics?:...` | `Promise<boolean>` | — |
| `soProfileByVersion` | `i: GetProfileByVersionInput, o: GetProfileByVersionOutput, c: UserProfileContext, metri...` | `Promise<boolean>` | — |
| `resetUserProfile` | `i: ResetUserProfileInput, o: ResetUserProfileOutput, c: UserProfileContext, metrics?: M...` | `Promise<boolean>` | — |
| `configUserProfile` | `i: ConfigUserProfileInput, o: ConfigUserProfileOutput, c: UserProfileContext, metrics?:...` | `Promise<boolean>` | — |
