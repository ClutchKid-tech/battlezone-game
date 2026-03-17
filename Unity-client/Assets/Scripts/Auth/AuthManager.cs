using System;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json;
using BattleZone.Utils;

namespace BattleZone.Auth
{
    [Serializable]
    public class LoginRequest
    {
        public string usernameOrEmail;
        public string password;
    }

    [Serializable]
    public class RegisterRequest
    {
        public string username;
        public string email;
        public string password;
    }

    [Serializable]
    public class AuthResponse
    {
        public string access;
        public string refresh;
        public string userId;
        public string username;
    }

    public class AuthManager : MonoBehaviour
    {
        public static AuthManager Instance { get; private set; }

        [SerializeField] private string apiBaseUrl = "https://battle-royale-sigma.vercel.app";

        public event Action<string, string, string, string> OnLoginSuccess; // access, userId, username, refresh
        public event Action<string> OnLoginFailed;
        public event Action<string, string, string, string> OnRegisterSuccess;
        public event Action<string> OnRegisterFailed;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        public async Task LoginAsync(string usernameOrEmail, string password)
        {
            var body = JsonConvert.SerializeObject(new LoginRequest
            {
                usernameOrEmail = usernameOrEmail,
                password = password
            });

            try
            {
                var response = await PostAsync("/api/auth/login", body);
                var auth = JsonConvert.DeserializeObject<AuthResponse>(response);

                if (string.IsNullOrEmpty(auth?.access))
                    throw new Exception("Invalid server response: missing access token.");

                TokenStorage.Save(auth.access, auth.refresh, auth.userId, auth.username);
                OnLoginSuccess?.Invoke(auth.access, auth.userId, auth.username, auth.refresh);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[AuthManager] Login failed: {ex.Message}");
                OnLoginFailed?.Invoke(ex.Message);
            }
        }

        public async Task RegisterAsync(string username, string email, string password)
        {
            var body = JsonConvert.SerializeObject(new RegisterRequest
            {
                username = username,
                email = email,
                password = password
            });

            try
            {
                var response = await PostAsync("/api/auth/register", body);
                var auth = JsonConvert.DeserializeObject<AuthResponse>(response);

                if (string.IsNullOrEmpty(auth?.access))
                    throw new Exception("Invalid server response: missing access token.");

                TokenStorage.Save(auth.access, auth.refresh, auth.userId, auth.username);
                OnRegisterSuccess?.Invoke(auth.access, auth.userId, auth.username, auth.refresh);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[AuthManager] Register failed: {ex.Message}");
                OnRegisterFailed?.Invoke(ex.Message);
            }
        }

        public void Logout()
        {
            TokenStorage.Clear();
        }

        private async Task<string> PostAsync(string path, string jsonBody)
        {
            var url = apiBaseUrl.TrimEnd('/') + path;
            var bytes = Encoding.UTF8.GetBytes(jsonBody);

            using var req = new UnityWebRequest(url, "POST");
            req.uploadHandler   = new UploadHandlerRaw(bytes);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");

            var op = req.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (req.result != UnityWebRequest.Result.Success)
            {
                // Try to parse server error message
                string serverMsg = req.downloadHandler.text;
                try
                {
                    var err = JsonConvert.DeserializeAnonymousType(serverMsg, new { message = "" });
                    if (!string.IsNullOrEmpty(err?.message)) throw new Exception(err.message);
                }
                catch (JsonException) { /* fall through */ }
                throw new Exception($"HTTP {req.responseCode}: {req.error}");
            }

            return req.downloadHandler.text;
        }
    }
}
