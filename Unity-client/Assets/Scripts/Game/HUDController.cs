using UnityEngine;
using UnityEngine.UI;
using TMPro;
using BattleZone.Player;

namespace BattleZone.Game
{
    public class HUDController : MonoBehaviour
    {
        [Header("Health / Armor")]
        [SerializeField] private Slider   hpBar;
        [SerializeField] private Slider   armorBar;
        [SerializeField] private TMP_Text hpLabel;
        [SerializeField] private TMP_Text armorLabel;

        [Header("Ammo")]
        [SerializeField] private TMP_Text ammoLabel;    // "30 / 90"
        [SerializeField] private TMP_Text weaponName;

        [Header("Zone timer")]
        [SerializeField] private TMP_Text zoneTimerLabel;
        [SerializeField] private TMP_Text zonePhaseLabel;

        [Header("Kill feed / player count")]
        [SerializeField] private TMP_Text playerCountLabel;  // "47 alive"

        [Header("End screen")]
        [SerializeField] private GameObject endScreen;
        [SerializeField] private TMP_Text   endTitleText;
        [SerializeField] private Button     endReturnButton;

        private PlayerHealth   _health;
        private Weapons.WeaponSystem _weaponSystem;
        private float          _zoneTimer;

        private void Start()
        {
            var local = GameObject.FindWithTag("LocalPlayer");
            if (local != null)
            {
                _health       = local.GetComponent<PlayerHealth>();
                _weaponSystem = local.GetComponent<Weapons.WeaponSystem>();

                _health.OnHealthChanged += UpdateHealthDisplay;

                if (_weaponSystem?.CurrentWeapon != null)
                    _weaponSystem.CurrentWeapon.OnAmmoChanged += UpdateAmmoDisplay;
            }

            endReturnButton?.onClick.AddListener(GameManager.Instance.ReturnToMenu);
            endScreen?.SetActive(false);
        }

        private void OnDestroy()
        {
            if (_health != null) _health.OnHealthChanged -= UpdateHealthDisplay;
            endReturnButton?.onClick.RemoveAllListeners();
        }

        private void Update()
        {
            if (_zoneTimer > 0f)
            {
                _zoneTimer -= Time.deltaTime;
                if (zoneTimerLabel != null)
                    zoneTimerLabel.SetText(FormatTime(_zoneTimer));
            }
        }

        public void ShowHUD(bool show)
        {
            gameObject.SetActive(show);
        }

        public void ShowEndScreen(bool won)
        {
            endScreen?.SetActive(true);
            if (endTitleText != null)
                endTitleText.SetText(won ? "#1 VICTORY ROYALE" : "ELIMINATED");
            endTitleText.color = won
                ? new Color(0.94f, 0.75f, 0.25f) // gold
                : new Color(0.91f, 0.14f, 0.04f); // red
        }

        public void UpdatePlayerCount(int count)
        {
            if (playerCountLabel != null) playerCountLabel.SetText($"{count} alive");
        }

        public void SetZoneTimer(float seconds, int phase)
        {
            _zoneTimer = seconds;
            if (zonePhaseLabel != null) zonePhaseLabel.SetText($"Zone {phase}");
        }

        private void UpdateHealthDisplay(float hp, float armor)
        {
            if (hpBar   != null) hpBar.value   = hp   / 100f;
            if (armorBar != null) armorBar.value = armor / 100f;
            if (hpLabel    != null) hpLabel.SetText($"{Mathf.CeilToInt(hp)}");
            if (armorLabel != null) armorLabel.SetText($"{Mathf.CeilToInt(armor)}");
        }

        private void UpdateAmmoDisplay(int ammo, int reserve)
        {
            if (ammoLabel != null) ammoLabel.SetText($"{ammo} / {reserve}");
        }

        private string FormatTime(float seconds)
        {
            int m = Mathf.FloorToInt(seconds / 60f);
            int s = Mathf.FloorToInt(seconds % 60f);
            return $"{m}:{s:00}";
        }
    }
}
