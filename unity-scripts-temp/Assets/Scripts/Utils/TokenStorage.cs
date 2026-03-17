using UnityEngine;

namespace BattleZone.Utils
{
    public static class TokenStorage
    {
        private const string KEY_ACCESS  = "bz_access_token";
        private const string KEY_REFRESH = "bz_refresh_token";
        private const string KEY_USER_ID = "bz_user_id";
        private const string KEY_USERNAME = "bz_username";

        public static void Save(string accessToken, string refreshToken, string userId, string username)
        {
            PlayerPrefs.SetString(KEY_ACCESS,   accessToken);
            PlayerPrefs.SetString(KEY_REFRESH,  refreshToken);
            PlayerPrefs.SetString(KEY_USER_ID,  userId);
            PlayerPrefs.SetString(KEY_USERNAME, username);
            PlayerPrefs.Save();
        }

        public static string AccessToken  => PlayerPrefs.GetString(KEY_ACCESS,   string.Empty);
        public static string RefreshToken => PlayerPrefs.GetString(KEY_REFRESH,  string.Empty);
        public static string UserId       => PlayerPrefs.GetString(KEY_USER_ID,  string.Empty);
        public static string Username     => PlayerPrefs.GetString(KEY_USERNAME, string.Empty);

        public static bool HasSession => !string.IsNullOrEmpty(AccessToken);

        public static void Clear()
        {
            PlayerPrefs.DeleteKey(KEY_ACCESS);
            PlayerPrefs.DeleteKey(KEY_REFRESH);
            PlayerPrefs.DeleteKey(KEY_USER_ID);
            PlayerPrefs.DeleteKey(KEY_USERNAME);
            PlayerPrefs.Save();
        }
    }
}
