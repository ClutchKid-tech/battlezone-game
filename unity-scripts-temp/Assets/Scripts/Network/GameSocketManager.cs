using System;
using UnityEngine;
using Newtonsoft.Json;
using BattleZone.Utils;

namespace BattleZone.Network
{
    // ── Shared data contracts ────────────────────────────────────────────────

    [Serializable]
    public class PlayerStateMsg
    {
        public string id;
        public float  x, y, z;
        public float  rotY;
        public float  hp;
        public bool   alive;
        public string weaponId;
    }

    [Serializable]
    public class HitMsg
    {
        public string shooterId;
        public string targetId;
        public float  damage;
        public string weaponId;
        public float  x, y, z;   // hit position
    }

    [Serializable]
    public class KillMsg
    {
        public string killerId;
        public string victimId;
        public string weaponId;
    }

    [Serializable]
    public class ZoneMsg
    {
        public float cx, cz;      // center
        public float radius;
        public float shrinkTime;  // seconds until next shrink
        public int   phase;
    }

    [Serializable]
    public class LootMsg
    {
        public string lootId;
        public string itemType;   // "weapon" | "ammo" | "armor" | "heal"
        public string itemId;
        public float  x, y, z;
        public int    amount;
    }

    [Serializable]
    public class LootPickupMsg
    {
        public string playerId;
        public string lootId;
    }

    // ── Manager ──────────────────────────────────────────────────────────────

    public class GameSocketManager : MonoBehaviour
    {
        public static GameSocketManager Instance { get; private set; }

        // Inbound events
        public event Action<PlayerStateMsg>  OnPlayerJoined;
        public event Action<PlayerStateMsg>  OnPlayerState;
        public event Action<string>          OnPlayerLeft;
        public event Action<HitMsg>          OnHit;
        public event Action<KillMsg>         OnKill;
        public event Action<ZoneMsg>         OnZoneUpdate;
        public event Action<LootMsg>         OnLootSpawn;
        public event Action<LootPickupMsg>   OnLootPickup;
        public event Action<int>             OnPlayerCount;  // alive count
        public event Action                  OnGameStart;
        public event Action<string>          OnGameEnd;      // winner id

        private NetworkManager _net;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void Start()
        {
            _net = NetworkManager.Instance;
        }

        private void OnDestroy()
        {
            _net?.DisconnectGame();
        }

        // ── Public API ──────────────────────────────────────────────────────────

        public void Connect()
        {
            _net.ConnectGame(TokenStorage.AccessToken);
            BindEvents();
        }

        public void SendState(float x, float y, float z, float rotY, string weaponId)
        {
            _net.GameSocket?.Emit("game:state", new { x, y, z, rotY, weaponId });
        }

        public void SendShoot(float ox, float oy, float oz, float dx, float dy, float dz)
        {
            _net.GameSocket?.Emit("game:shoot", new { ox, oy, oz, dx, dy, dz });
        }

        public void SendPickup(string lootId)
        {
            _net.GameSocket?.Emit("game:pickup", new { lootId });
        }

        public void SendDied(string killerId)
        {
            _net.GameSocket?.Emit("game:died", new { killerId });
        }

        // ── Private ─────────────────────────────────────────────────────────────

        private void BindEvents()
        {
            var sock = _net.GameSocket;
            if (sock == null) return;

            sock.On("game:start",        _ => _net.RunOnMainThread(() => OnGameStart?.Invoke()));
            sock.On("game:end",          d => _net.RunOnMainThread(() => OnGameEnd?.Invoke(d.GetValue<string>())));
            sock.On("game:player_join",  d => _net.RunOnMainThread(() => OnPlayerJoined?.Invoke(d.GetValue<PlayerStateMsg>())));
            sock.On("game:state",        d => _net.RunOnMainThread(() => OnPlayerState?.Invoke(d.GetValue<PlayerStateMsg>())));
            sock.On("game:player_leave", d => _net.RunOnMainThread(() => OnPlayerLeft?.Invoke(d.GetValue<string>())));
            sock.On("game:hit",          d => _net.RunOnMainThread(() => OnHit?.Invoke(d.GetValue<HitMsg>())));
            sock.On("game:kill",         d => _net.RunOnMainThread(() => OnKill?.Invoke(d.GetValue<KillMsg>())));
            sock.On("game:zone",         d => _net.RunOnMainThread(() => OnZoneUpdate?.Invoke(d.GetValue<ZoneMsg>())));
            sock.On("game:loot_spawn",   d => _net.RunOnMainThread(() => OnLootSpawn?.Invoke(d.GetValue<LootMsg>())));
            sock.On("game:loot_pickup",  d => _net.RunOnMainThread(() => OnLootPickup?.Invoke(d.GetValue<LootPickupMsg>())));
            sock.On("game:player_count", d => _net.RunOnMainThread(() => OnPlayerCount?.Invoke(d.GetValue<int>())));
        }
    }
}
