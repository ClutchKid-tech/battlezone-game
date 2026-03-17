using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace BattleZone.Shop
{
    public class ShopUI : MonoBehaviour
    {
        [Header("Layout")]
        [SerializeField] private GameObject    shopRoot;
        [SerializeField] private Transform     gridContainer;
        [SerializeField] private GameObject    itemCardPrefab;

        [Header("Tabs")]
        [SerializeField] private Button   tabAll;
        [SerializeField] private Button   tabSkins;
        [SerializeField] private Button   tabWeapons;
        [SerializeField] private Button   tabEmotes;
        [SerializeField] private Button   tabBundles;

        [Header("Coin display")]
        [SerializeField] private TMP_Text coinsLabel;

        [Header("Confirm modal")]
        [SerializeField] private GameObject  confirmModal;
        [SerializeField] private TMP_Text    confirmItemName;
        [SerializeField] private TMP_Text    confirmItemPrice;
        [SerializeField] private Button      confirmBuyButton;
        [SerializeField] private Button      confirmCancelButton;

        [Header("Toast")]
        [SerializeField] private TMP_Text toastText;
        [SerializeField] private float    toastDuration = 2f;

        private ShopManager    _shopMgr;
        private ItemCategory?  _activeFilter;
        private ShopItem       _pendingItem;
        private Coroutine      _toastCoroutine;

        private readonly List<GameObject> _cards = new();

        private void OnEnable()
        {
            _shopMgr = ShopManager.Instance;
            _shopMgr.OnCoinsUpdated    += UpdateCoinsDisplay;
            _shopMgr.OnPurchaseSuccess += HandlePurchaseSuccess;
            _shopMgr.OnPurchaseFailed  += HandlePurchaseFailed;

            tabAll.onClick.AddListener(()      => SetFilter(null));
            tabSkins.onClick.AddListener(()    => SetFilter(ItemCategory.Skin));
            tabWeapons.onClick.AddListener(()  => SetFilter(ItemCategory.Weapon));
            tabEmotes.onClick.AddListener(()   => SetFilter(ItemCategory.Emote));
            tabBundles.onClick.AddListener(()  => SetFilter(ItemCategory.Bundle));
            confirmBuyButton.onClick.AddListener(ConfirmPurchase);
            confirmCancelButton.onClick.AddListener(CloseConfirm);

            UpdateCoinsDisplay(_shopMgr.Coins);
            SetFilter(null);
        }

        private void OnDisable()
        {
            if (_shopMgr == null) return;
            _shopMgr.OnCoinsUpdated    -= UpdateCoinsDisplay;
            _shopMgr.OnPurchaseSuccess -= HandlePurchaseSuccess;
            _shopMgr.OnPurchaseFailed  -= HandlePurchaseFailed;

            tabAll.onClick.RemoveAllListeners();
            tabSkins.onClick.RemoveAllListeners();
            tabWeapons.onClick.RemoveAllListeners();
            tabEmotes.onClick.RemoveAllListeners();
            tabBundles.onClick.RemoveAllListeners();
            confirmBuyButton.onClick.RemoveAllListeners();
            confirmCancelButton.onClick.RemoveAllListeners();
        }

        // ── Private ─────────────────────────────────────────────────────────────

        private void SetFilter(ItemCategory? filter)
        {
            _activeFilter = filter;
            RebuildGrid();
        }

        private void RebuildGrid()
        {
            foreach (var c in _cards) Destroy(c);
            _cards.Clear();

            foreach (var item in _shopMgr.GetCatalog())
            {
                if (_activeFilter.HasValue && item.category != _activeFilter.Value) continue;

                var card = Instantiate(itemCardPrefab, gridContainer);
                _cards.Add(card);
                PopulateCard(card, item);
            }
        }

        private void PopulateCard(GameObject card, ShopItem item)
        {
            card.transform.Find("ItemName")?.GetComponent<TMP_Text>()?.SetText(item.displayName);
            card.transform.Find("Price")?.GetComponent<TMP_Text>()?.SetText(item.price.ToString("N0"));

            var img = card.transform.Find("Thumbnail")?.GetComponent<Image>();
            if (img != null && item.thumbnail != null) img.sprite = item.thumbnail;

            var rarityBar = card.transform.Find("RarityBar")?.GetComponent<Image>();
            if (rarityBar != null) rarityBar.color = item.rarityColor;

            var ownedBadge = card.transform.Find("OwnedBadge");
            if (ownedBadge != null) ownedBadge.gameObject.SetActive(_shopMgr.IsOwned(item.itemId));

            var btn = card.GetComponentInChildren<Button>();
            if (btn != null) btn.onClick.AddListener(() => OpenConfirm(item));
        }

        private void OpenConfirm(ShopItem item)
        {
            if (_shopMgr.IsOwned(item.itemId)) { ShowToast("Already owned."); return; }

            _pendingItem = item;
            confirmItemName.SetText(item.displayName);
            confirmItemPrice.SetText($"{item.price:N0} BZ Coins");
            confirmModal.SetActive(true);
        }

        private void CloseConfirm()
        {
            confirmModal.SetActive(false);
            _pendingItem = null;
        }

        private void ConfirmPurchase()
        {
            if (_pendingItem == null) return;
            CloseConfirm();
            _ = _shopMgr.PurchaseAsync(_pendingItem.itemId);
        }

        private void HandlePurchaseSuccess(string itemId)
        {
            RebuildGrid();
            ShowToast("Purchase successful!");
        }

        private void HandlePurchaseFailed(string error)
        {
            ShowToast($"Purchase failed: {error}");
        }

        private void UpdateCoinsDisplay(int coins)
        {
            if (coinsLabel != null) coinsLabel.SetText($"{coins:N0}");
        }

        private void ShowToast(string message)
        {
            if (toastText == null) return;
            if (_toastCoroutine != null) StopCoroutine(_toastCoroutine);
            _toastCoroutine = StartCoroutine(ToastRoutine(message));
        }

        private System.Collections.IEnumerator ToastRoutine(string message)
        {
            toastText.SetText(message);
            toastText.gameObject.SetActive(true);
            yield return new WaitForSeconds(toastDuration);
            toastText.gameObject.SetActive(false);
        }
    }
}
