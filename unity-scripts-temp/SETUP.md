# BattleZone — Unity 6 Client Setup

## Requirements
- Unity 6 (6000.0.x) — Universal Render Pipeline template
- Git

---

## 1 — Create the Unity project

1. Open Unity Hub → **New Project**
2. Select **Universal 3D (URP)** template
3. Name it `BattleZone` and point it at this folder (`unity-client/`)
4. Click **Create project**

Unity will generate the default URP folders. The `Assets/Scripts/` folder from this repo goes **inside** the project's `Assets/` directory.

---

## 2 — Install packages via Package Manager

Open **Window → Package Manager**, then add each by name:

| Package | Version |
|---|---|
| TextMeshPro | 3.0.9 (included in URP template) |
| Input System | 1.8.2 |
| Newtonsoft JSON for Unity | `com.unity.nuget.newtonsoft-json` 3.2.1 |

**Socket.IO client** — install via OpenUPM:
```
# In terminal (from the project root)
openupm add com.izifortune.socketio
```
Or add the scoped registry manually in **Edit → Project Settings → Package Manager**:
- Name: `package.openupm.com`
- URL: `https://package.openupm.com`
- Scope: `com.izifortune.socketio`

Then install `SocketIOUnity` from Package Manager.

---

## 3 — Create scenes

### Scene: `Login`
1. **File → New Scene** → save as `Assets/Scenes/Login.unity`
2. Create a Canvas (Screen Space – Overlay, 1920×1080 reference)
3. Add two child panels: **LoginPanel**, **RegisterPanel**
4. Add UI elements per [LoginUI.cs] field references (TMP_InputField, Button, TMP_Text)
5. Add an empty GameObject → attach `AuthManager`, `NetworkManager` scripts
6. Add another → attach `LoginUI`, wire all [SerializeField] references in inspector
7. Add `loadingOverlay` panel, set inactive by default

### Scene: `MainMenu`
1. New Scene → save as `Assets/Scenes/MainMenu.unity`
2. Add `AuthManager`, `NetworkManager`, `MatchmakingManager` on a persistent GO
3. Add a Canvas with main menu UI (Play button, Shop button)
4. Wire `MatchmakingManager` — call `Connect()` on Start, `JoinQueue()` on Play click

### Scene: `Game`
1. New Scene → save as `Assets/Scenes/Game.unity`
2. **Hierarchy structure:**
```
─ Managers
  ├── [AuthManager]
  ├── [NetworkManager]
  ├── [GameSocketManager]
  ├── [GameManager]
  ├── [LootManager]
  └── [ShopManager]
─ LocalPlayer (tag: "LocalPlayer")
  ├── [CharacterController]
  ├── [PlayerController]
  ├── [PlayerHealth]
  ├── [PlayerCombat]
  ├── [WeaponSystem]
  └── CameraRig
      └── Main Camera
─ World
  ├── Terrain
  ├── ZoneCircle [LineRenderer]
  └── ZoneWallCylinder
─ HUD Canvas
  ├── [HUDController]
  ├── [KillFeed]
  └── EndScreen (inactive)
```

---

## 4 — Build settings

1. **File → Build Settings**
2. Add scenes in order:
   - `Assets/Scenes/Login`
   - `Assets/Scenes/MainMenu`
   - `Assets/Scenes/Game`
3. Platform: **PC, Mac & Linux Standalone** (or WebGL for browser play)

For **WebGL**:
- Player Settings → Publishing Settings → Enable exceptions: **Explicitly Thrown Exceptions Only**
- Compression: **Gzip**
- Memory size: **512 MB**

---

## 5 — Configure server URL

Select the `AuthManager` and `NetworkManager` GameObjects in the Login scene.
Set **Api Base Url** / **Server Url** to:
```
https://battle-royale-sigma.vercel.app
```
Or your local tunnel (e.g., `https://your-id.loca.lt`) for local dev.

---

## 6 — Create WeaponStats ScriptableObjects

1. **Right-click Assets/ScriptableObjects/Weapons → Create → BattleZone → Weapon Stats**
2. Create three assets: `AR_M4A1`, `Sniper_AWM`, `SMG_MP5`
3. Fill values from the `.asset.template` files in the same folder
4. Drag into **WeaponSystem → Starting Weapons** on the LocalPlayer

---

## 7 — Create ShopItem ScriptableObjects

1. **Right-click Assets/ScriptableObjects/Shop → Create → BattleZone → Shop Item**
2. Create items matching the shop catalog on the web client (itemIds must match exactly)
3. Drag into **ShopManager → Catalog** list

---

## 8 — Input System

If asked to switch Input System backend:
- **Edit → Project Settings → Player → Other Settings → Active Input Handling** → set to **Input System Package (New)** or **Both**
- Restart Unity when prompted

---

## Script namespace summary

| Namespace | Location | Purpose |
|---|---|---|
| `BattleZone.Utils` | Scripts/Utils/ | TokenStorage (PlayerPrefs) |
| `BattleZone.Auth` | Scripts/Auth/ | AuthManager, LoginUI |
| `BattleZone.Network` | Scripts/Network/ | NetworkManager, MatchmakingManager, GameSocketManager |
| `BattleZone.Player` | Scripts/Player/ | PlayerController, PlayerHealth, PlayerCombat, RemotePlayer, RemotePlayerInterpolator |
| `BattleZone.Weapons` | Scripts/Weapons/ | WeaponStats (SO), WeaponBase, WeaponSystem |
| `BattleZone.Shop` | Scripts/Shop/ | ShopItem (SO), ShopManager, ShopUI |
| `BattleZone.Game` | Scripts/Game/ | GameManager, ZoneController, LootManager, KillFeed, HUDController |

---

## Auth flow (mirrors web client)

```
Login scene
  → AuthManager.LoginAsync() → POST /api/auth/login
  → Server returns { access, refresh, userId, username }
  → TokenStorage.Save(...)
  → SceneManager.LoadScene("MainMenu")

MainMenu scene
  → NetworkManager.ConnectMatchmaking(token)   ← /matchmaking namespace
  → MatchmakingManager.JoinQueue("solo", "us-east")
  → Server emits mm:queued  → mm:found  → mm:match_ready
  → SceneManager.LoadScene("Game")

Game scene
  → GameSocketManager.Connect()   ← /game namespace
  → Server emits game:start
  → PlayerController/PlayerCombat active
  → SendState() at 20 Hz, SendShoot() on fire
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `SocketIOUnity` not found | Install via OpenUPM (see step 2) |
| `NewtonsoftJson` namespace error | Add `com.unity.nuget.newtonsoft-json` in Package Manager |
| WebSocket connect fails in Editor | Server must allow CORS + WS from `localhost` |
| Token not persisting between scenes | `AuthManager` and `NetworkManager` use `DontDestroyOnLoad` — only add them once in Login scene |
| Input not responding | Check Active Input Handling is set to **Both** or **New** |
