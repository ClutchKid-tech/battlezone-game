using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;
using BattleZone.Network;
using BattleZone.Player;
using BattleZone.Utils;

namespace BattleZone.Game
{
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [Header("Prefabs")]
        [SerializeField] private GameObject remotePlayerPrefab;

        [Header("References")]
        [SerializeField] private GameObject  localPlayerGO;
        [SerializeField] private HUDController hud;
        [SerializeField] private KillFeed    killFeed;
        [SerializeField] private ZoneController zone;
        [SerializeField] private LootManager loot;

        public int  PlayersAlive  { get; private set; }
        public bool GameActive    { get; private set; }
        public string LocalId     => TokenStorage.UserId;

        private readonly Dictionary<string, RemotePlayer> _remotePlayers = new();
        private GameSocketManager _gameSocket;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
        }

        private void Start()
        {
            _gameSocket = GameSocketManager.Instance;
            BindEvents();
            _gameSocket.Connect();
        }

        private void OnDestroy()
        {
            UnbindEvents();
        }

        // ── Public ───────────────────────────────────────────────────────────────

        public void ReturnToMenu()
        {
            NetworkManager.Instance.DisconnectAll();
            SceneManager.LoadScene("MainMenu");
        }

        // ── Event binding ────────────────────────────────────────────────────────

        private void BindEvents()
        {
            _gameSocket.OnGameStart    += HandleGameStart;
            _gameSocket.OnGameEnd      += HandleGameEnd;
            _gameSocket.OnPlayerJoined += HandlePlayerJoined;
            _gameSocket.OnPlayerState  += HandlePlayerState;
            _gameSocket.OnPlayerLeft   += HandlePlayerLeft;
            _gameSocket.OnKill         += HandleKill;
            _gameSocket.OnZoneUpdate   += HandleZoneUpdate;
            _gameSocket.OnLootSpawn    += HandleLootSpawn;
            _gameSocket.OnLootPickup   += HandleLootPickup;
            _gameSocket.OnPlayerCount  += HandlePlayerCount;
        }

        private void UnbindEvents()
        {
            if (_gameSocket == null) return;
            _gameSocket.OnGameStart    -= HandleGameStart;
            _gameSocket.OnGameEnd      -= HandleGameEnd;
            _gameSocket.OnPlayerJoined -= HandlePlayerJoined;
            _gameSocket.OnPlayerState  -= HandlePlayerState;
            _gameSocket.OnPlayerLeft   -= HandlePlayerLeft;
            _gameSocket.OnKill         -= HandleKill;
            _gameSocket.OnZoneUpdate   -= HandleZoneUpdate;
            _gameSocket.OnLootSpawn    -= HandleLootSpawn;
            _gameSocket.OnLootPickup   -= HandleLootPickup;
            _gameSocket.OnPlayerCount  -= HandlePlayerCount;
        }

        // ── Handlers ─────────────────────────────────────────────────────────────

        private void HandleGameStart()
        {
            GameActive = true;
            localPlayerGO.SetActive(true);
            hud?.ShowHUD(true);
            Debug.Log("[GameManager] Game started.");
        }

        private void HandleGameEnd(string winnerId)
        {
            GameActive = false;
            bool isWinner = winnerId == LocalId;
            hud?.ShowEndScreen(isWinner);
            Debug.Log($"[GameManager] Game ended. Winner: {winnerId}");
        }

        private void HandlePlayerJoined(PlayerStateMsg msg)
        {
            if (msg.id == LocalId) return;
            if (_remotePlayers.ContainsKey(msg.id)) return;

            var go     = Instantiate(remotePlayerPrefab,
                                     new Vector3(msg.x, msg.y, msg.z),
                                     Quaternion.Euler(0f, msg.rotY, 0f));
            var remote = go.GetComponent<RemotePlayer>();
            remote.Init(msg.id, msg.id, new Vector3(msg.x, msg.y, msg.z));
            _remotePlayers[msg.id] = remote;
        }

        private void HandlePlayerState(PlayerStateMsg msg)
        {
            if (msg.id == LocalId) return;
            if (_remotePlayers.TryGetValue(msg.id, out var remote))
                remote.ApplyState(msg);
        }

        private void HandlePlayerLeft(string playerId)
        {
            if (_remotePlayers.TryGetValue(playerId, out var remote))
            {
                Destroy(remote.gameObject);
                _remotePlayers.Remove(playerId);
            }
        }

        private void HandleKill(KillMsg msg)
        {
            killFeed?.AddEntry(msg.killerId, msg.victimId, msg.weaponId);

            if (_remotePlayers.TryGetValue(msg.victimId, out var remote))
                remote.Kill();
        }

        private void HandleZoneUpdate(ZoneMsg msg)
        {
            zone?.ApplyZoneUpdate(msg);
        }

        private void HandleLootSpawn(LootMsg msg)
        {
            loot?.SpawnLoot(msg);
        }

        private void HandleLootPickup(LootPickupMsg msg)
        {
            loot?.RemoveLoot(msg.lootId);
        }

        private void HandlePlayerCount(int count)
        {
            PlayersAlive = count;
            hud?.UpdatePlayerCount(count);
        }
    }
}
