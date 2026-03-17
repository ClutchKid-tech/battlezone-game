using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json;
using BattleZone.Utils;

namespace BattleZone.Shop
{
    [Serializable]
    public class PurchaseRequest
    {
        public string itemId;
    }

    [Serializable]
    public class PurchaseResponse
    {
        public bool   success;
        public int    newBalance;
        public string message;
    }

    public class ShopManager : MonoBehaviour
    {
        public static ShopManager Instance { get; private set; }

        [SerializeField] private string apiBaseUrl = "https://battle-royale-sigma.vercel.app";
        [SerializeField] private List<ShopItem> catalog;

        public int    Coins    { get; private set; }
        public List<string> OwnedIds { get; private set; } = new();

        public event Action<int>    OnCoinsUpdated;
        public event Action<string> OnPurchaseSuccess;
        public event Action<string> OnPurchaseFailed;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private async void Start()
        {
            await RefreshBalanceAsync();
        }

        public IReadOnlyList<ShopItem> GetCatalog() => catalog.AsReadOnly();

        public bool IsOwned(string itemId) => OwnedIds.Contains(itemId);

        public async Task PurchaseAsync(string itemId)
        {
            var body = JsonConvert.SerializeObject(new PurchaseRequest { itemId = itemId });

            try
            {
                var result = await PostAsync("/api/shop/purchase", body);
                var resp   = JsonConvert.DeserializeObject<PurchaseResponse>(result);

                if (resp == null || !resp.success)
                    throw new Exception(resp?.message ?? "Purchase failed.");

                Coins = resp.newBalance;
                OwnedIds.Add(itemId);
                OnCoinsUpdated?.Invoke(Coins);
                OnPurchaseSuccess?.Invoke(itemId);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[ShopManager] Purchase failed: {ex.Message}");
                OnPurchaseFailed?.Invoke(ex.Message);
            }
        }

        public async Task RefreshBalanceAsync()
        {
            try
            {
                var result  = await GetAsync("/api/shop/balance");
                var payload = JsonConvert.DeserializeAnonymousType(result, new { coins = 0, owned = new List<string>() });
                Coins    = payload.coins;
                OwnedIds = payload.owned ?? new List<string>();
                OnCoinsUpdated?.Invoke(Coins);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[ShopManager] Balance refresh failed: {ex.Message}");
            }
        }

        // ── HTTP helpers ─────────────────────────────────────────────────────────

        private async Task<string> GetAsync(string path)
        {
            using var req = UnityWebRequest.Get(apiBaseUrl.TrimEnd('/') + path);
            req.SetRequestHeader("Authorization", $"Bearer {TokenStorage.AccessToken}");
            var op = req.SendWebRequest();
            while (!op.isDone) await Task.Yield();
            if (req.result != UnityWebRequest.Result.Success)
                throw new Exception($"GET {path} failed: {req.error}");
            return req.downloadHandler.text;
        }

        private async Task<string> PostAsync(string path, string jsonBody)
        {
            var bytes = Encoding.UTF8.GetBytes(jsonBody);
            using var req = new UnityWebRequest(apiBaseUrl.TrimEnd('/') + path, "POST");
            req.uploadHandler   = new UploadHandlerRaw(bytes);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type",  "application/json");
            req.SetRequestHeader("Authorization", $"Bearer {TokenStorage.AccessToken}");
            var op = req.SendWebRequest();
            while (!op.isDone) await Task.Yield();
            if (req.result != UnityWebRequest.Result.Success)
                throw new Exception($"POST {path} failed: {req.error}");
            return req.downloadHandler.text;
        }
    }
}
