using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using BattleZone.Utils;

namespace BattleZone.Auth
{
    public class LoginUI : MonoBehaviour
    {
        [Header("Panels")]
        [SerializeField] private GameObject loginPanel;
        [SerializeField] private GameObject registerPanel;
        [SerializeField] private GameObject loadingOverlay;

        [Header("Login Fields")]
        [SerializeField] private TMP_InputField loginUsernameField;
        [SerializeField] private TMP_InputField loginPasswordField;
        [SerializeField] private Button         loginSubmitButton;
        [SerializeField] private Button         loginToRegisterButton;
        [SerializeField] private TMP_Text       loginErrorText;

        [Header("Register Fields")]
        [SerializeField] private TMP_InputField registerUsernameField;
        [SerializeField] private TMP_InputField registerEmailField;
        [SerializeField] private TMP_InputField registerPasswordField;
        [SerializeField] private Button         registerSubmitButton;
        [SerializeField] private Button         registerToLoginButton;
        [SerializeField] private TMP_Text       registerErrorText;

        private AuthManager _auth;

        private void Awake()
        {
            _auth = AuthManager.Instance;
        }

        private void OnEnable()
        {
            loginSubmitButton.onClick.AddListener(OnLoginClicked);
            loginToRegisterButton.onClick.AddListener(ShowRegister);
            registerSubmitButton.onClick.AddListener(OnRegisterClicked);
            registerToLoginButton.onClick.AddListener(ShowLogin);

            _auth.OnLoginSuccess    += HandleAuthSuccess;
            _auth.OnLoginFailed     += HandleLoginFailed;
            _auth.OnRegisterSuccess += HandleAuthSuccess;
            _auth.OnRegisterFailed  += HandleRegisterFailed;

            // Check for saved session
            if (TokenStorage.HasSession)
            {
                SetLoading(true);
                _ = TryAutoLoginAsync();
            }
            else
            {
                ShowLogin();
            }
        }

        private void OnDisable()
        {
            loginSubmitButton.onClick.RemoveListener(OnLoginClicked);
            loginToRegisterButton.onClick.RemoveListener(ShowRegister);
            registerSubmitButton.onClick.RemoveListener(OnRegisterClicked);
            registerToLoginButton.onClick.RemoveListener(ShowLogin);

            _auth.OnLoginSuccess    -= HandleAuthSuccess;
            _auth.OnLoginFailed     -= HandleLoginFailed;
            _auth.OnRegisterSuccess -= HandleAuthSuccess;
            _auth.OnRegisterFailed  -= HandleRegisterFailed;
        }

        private async Task TryAutoLoginAsync()
        {
            // Validate token by hitting /api/auth/me or just proceed with stored token
            // For now trust the stored token and hand off to NetworkManager
            await Task.Yield();
            HandleAuthSuccess(TokenStorage.AccessToken, TokenStorage.UserId,
                              TokenStorage.Username,    TokenStorage.RefreshToken);
        }

        private void OnLoginClicked()
        {
            ClearErrors();
            string user = loginUsernameField.text.Trim();
            string pass = loginPasswordField.text;

            if (string.IsNullOrEmpty(user) || string.IsNullOrEmpty(pass))
            {
                loginErrorText.text = "Please fill in all fields.";
                return;
            }

            SetLoading(true);
            _ = _auth.LoginAsync(user, pass);
        }

        private void OnRegisterClicked()
        {
            ClearErrors();
            string user  = registerUsernameField.text.Trim();
            string email = registerEmailField.text.Trim();
            string pass  = registerPasswordField.text;

            if (string.IsNullOrEmpty(user) || string.IsNullOrEmpty(email) || string.IsNullOrEmpty(pass))
            {
                registerErrorText.text = "Please fill in all fields.";
                return;
            }

            if (pass.Length < 6)
            {
                registerErrorText.text = "Password must be at least 6 characters.";
                return;
            }

            SetLoading(true);
            _ = _auth.RegisterAsync(user, email, pass);
        }

        private void HandleAuthSuccess(string access, string userId, string username, string refresh)
        {
            SetLoading(false);
            // Transition to main menu scene
            UnityEngine.SceneManagement.SceneManager.LoadScene("MainMenu");
        }

        private void HandleLoginFailed(string error)
        {
            SetLoading(false);
            loginErrorText.text = error;
        }

        private void HandleRegisterFailed(string error)
        {
            SetLoading(false);
            registerErrorText.text = error;
        }

        private void ShowLogin()
        {
            loginPanel.SetActive(true);
            registerPanel.SetActive(false);
            ClearErrors();
        }

        private void ShowRegister()
        {
            loginPanel.SetActive(false);
            registerPanel.SetActive(true);
            ClearErrors();
        }

        private void SetLoading(bool active)
        {
            if (loadingOverlay != null) loadingOverlay.SetActive(active);
            loginSubmitButton.interactable    = !active;
            registerSubmitButton.interactable = !active;
        }

        private void ClearErrors()
        {
            if (loginErrorText    != null) loginErrorText.text    = string.Empty;
            if (registerErrorText != null) registerErrorText.text = string.Empty;
        }
    }
}
