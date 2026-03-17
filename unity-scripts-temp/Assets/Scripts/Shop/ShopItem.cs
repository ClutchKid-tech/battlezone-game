using UnityEngine;

namespace BattleZone.Shop
{
    public enum ItemRarity { Common, Uncommon, Rare, Epic, Legendary }
    public enum ItemCategory { Skin, Weapon, Emote, Bundle }

    [CreateAssetMenu(fileName = "ShopItem", menuName = "BattleZone/Shop Item")]
    public class ShopItem : ScriptableObject
    {
        [Header("Identity")]
        public string       itemId;
        public string       displayName;
        public string       description;
        public ItemRarity   rarity;
        public ItemCategory category;

        [Header("Pricing")]
        public int  price;
        public bool onSale;
        public int  originalPrice;

        [Header("Visuals")]
        public Sprite thumbnail;
        public Color  rarityColor = Color.white;

        [Header("Preview")]
        public GameObject previewPrefab; // optional 3D preview
    }
}
