using System;
using System.Collections.Generic;
using UnityEngine;
using SocketIOClient;
using SocketIOClient.Newtonsoft.Json;
using BattleZone.Utils;

namespace BattleZone.Network
{
    /// <summary>
    /// Central hub that owns all Socket.IO connections.
    /// Other managers request sockets from here rather than opening their own.
    /// </summary>
    public class NetworkManager : MonoBehaviour
    {
        public static NetworkManager Instance { get; private set; }

        [SerializeField] private string serverUrl = "https://battle-royale-sigma.vercel.app";

        // Namespaced sockets
        public SocketIOUnity MatchmakingSocket { get; private set; }
        public SocketIOUnity GameSocket        { get; private set; }
        public SocketIOUnity VoiceSocket       { get; private set; }

        public bool IsMatchmakingConnected => MatchmakingSocket?.Connected ?? false;
        public bool IsGameConnected        => GameSocket?.Connected        ?? false;

        private readonly Queue<Action> _mainThreadQueue = new();

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void Update()
        {
            while (_mainThreadQueue.Count > 0)
                _mainThreadQueue.Dequeue()?.Invoke();
        }

        private void OnDestroy()
        {
            DisconnectAll();
        }

        // ── Public API ─────────────────────────────────────────────────────────

        public void ConnectMatchmaking(string token)
        {
            if (MatchmakingSocket != null) return;

            MatchmakingSocket = BuildSocket("/matchmaking", token);
            MatchmakingSocket.Connect();
            Debug.Log("[NetworkManager] Matchmaking socket connecting…");
        }

        public void ConnectGame(string token)
        {
            if (GameSocket != null) return;

            GameSocket = BuildSocket("/game", token);
            GameSocket.Connect();
            Debug.Log("[NetworkManager] Game socket connecting…");
        }

        public void ConnectVoice(string token)
        {
            if (VoiceSocket != null) return;

            VoiceSocket = BuildSocket("/voice", token);
            VoiceSocket.Connect();
            Debug.Log("[NetworkManager] Voice socket connecting…");
        }

        public void DisconnectMatchmaking()
        {
            MatchmakingSocket?.Disconnect();
            MatchmakingSocket = null;
        }

        public void DisconnectGame()
        {
            GameSocket?.Disconnect();
            GameSocket = null;
        }

        public void DisconnectAll()
        {
            DisconnectMatchmaking();
            DisconnectGame();
            VoiceSocket?.Disconnect();
            VoiceSocket = null;
        }

        /// <summary>Enqueues an action to run on the Unity main thread.</summary>
        public void RunOnMainThread(Action action) => _mainThreadQueue.Enqueue(action);

        // ── Private helpers ────────────────────────────────────────────────────

        private SocketIOUnity BuildSocket(string nsp, string token)
        {
            var uri = new Uri(serverUrl.TrimEnd('/') + nsp);

            var socket = new SocketIOUnity(uri, new SocketIOOptions
            {
                Auth = new Dictionary<string, string> { { "token", token } },
                Transport = SocketIOClient.Transport.TransportProtocol.WebSocket,
                EIO = SocketIOClient.EnginIO.EIOScheme.EIO4,
                ConnectionTimeout = TimeSpan.FromSeconds(10),
                ReconnectionAttempts = 5,
                ReconnectionDelay = 2000
            });

            socket.JsonSerializer = new NewtonsoftJsonSerializer();

            socket.OnConnected    += (_, _) => Debug.Log($"[NetworkManager] {nsp} connected.");
            socket.OnDisconnected += (_, reason) => Debug.Log($"[NetworkManager] {nsp} disconnected: {reason}");
            socket.OnError        += (_, err)    => Debug.LogWarning($"[NetworkManager] {nsp} error: {err}");

            return socket;
        }
    }
}
