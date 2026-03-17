using UnityEngine;
using BattleZone.Network;

namespace BattleZone.Player
{
    [RequireComponent(typeof(CharacterController))]
    public class PlayerController : MonoBehaviour
    {
        [Header("Movement")]
        [SerializeField] private float walkSpeed   = 5f;
        [SerializeField] private float sprintSpeed = 9f;
        [SerializeField] private float crouchSpeed = 2.5f;
        [SerializeField] private float jumpForce   = 5f;
        [SerializeField] private float gravity     = -20f;

        [Header("Camera")]
        [SerializeField] private Transform cameraRig;
        [SerializeField] private float     mouseSensitivity = 2f;
        [SerializeField] private float     minPitch = -80f;
        [SerializeField] private float     maxPitch =  80f;

        [Header("Crouch")]
        [SerializeField] private float standHeight  = 1.8f;
        [SerializeField] private float crouchHeight = 1.0f;
        [SerializeField] private float crouchTransitionSpeed = 8f;

        // State
        private CharacterController _cc;
        private Vector3             _velocity;
        private float               _pitch;
        private bool                _isCrouching;
        private bool                _isSprinting;
        private bool                _alive = true;

        // Network send throttle
        private float _sendInterval = 0.05f; // 20Hz
        private float _sendTimer;

        private GameSocketManager _gameSocket;

        private void Awake()
        {
            _cc = GetComponent<CharacterController>();
        }

        private void Start()
        {
            _gameSocket = GameSocketManager.Instance;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible   = false;
        }

        private void OnDestroy()
        {
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible   = true;
        }

        private void Update()
        {
            if (!_alive) return;

            HandleLook();
            HandleMove();
            HandleCrouch();
            ThrottledNetworkSend();
        }

        public void SetAlive(bool alive)
        {
            _alive = alive;
            if (!alive)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible   = true;
            }
        }

        // ── Private ─────────────────────────────────────────────────────────────

        private void HandleLook()
        {
            float mouseX = Input.GetAxisRaw("Mouse X") * mouseSensitivity;
            float mouseY = Input.GetAxisRaw("Mouse Y") * mouseSensitivity;

            transform.Rotate(Vector3.up * mouseX);

            _pitch = Mathf.Clamp(_pitch - mouseY, minPitch, maxPitch);
            cameraRig.localEulerAngles = new Vector3(_pitch, 0f, 0f);
        }

        private void HandleMove()
        {
            bool grounded = _cc.isGrounded;
            if (grounded && _velocity.y < 0f) _velocity.y = -2f;

            float h = Input.GetAxisRaw("Horizontal");
            float v = Input.GetAxisRaw("Vertical");

            _isSprinting = Input.GetKey(KeyCode.LeftShift) && v > 0f && !_isCrouching;

            float speed = _isCrouching ? crouchSpeed : _isSprinting ? sprintSpeed : walkSpeed;

            Vector3 move = transform.right * h + transform.forward * v;
            if (move.sqrMagnitude > 1f) move.Normalize();

            _cc.Move(move * speed * Time.deltaTime);

            if (Input.GetButtonDown("Jump") && grounded && !_isCrouching)
                _velocity.y = Mathf.Sqrt(jumpForce * -2f * gravity);

            _velocity.y += gravity * Time.deltaTime;
            _cc.Move(_velocity * Time.deltaTime);
        }

        private void HandleCrouch()
        {
            if (Input.GetKeyDown(KeyCode.C))
                _isCrouching = !_isCrouching;

            float targetHeight = _isCrouching ? crouchHeight : standHeight;
            _cc.height = Mathf.Lerp(_cc.height, targetHeight, crouchTransitionSpeed * Time.deltaTime);

            // Adjust center so feet stay on ground
            _cc.center = new Vector3(0f, _cc.height / 2f, 0f);
        }

        private void ThrottledNetworkSend()
        {
            _sendTimer += Time.deltaTime;
            if (_sendTimer < _sendInterval) return;
            _sendTimer = 0f;

            var pos = transform.position;
            _gameSocket?.SendState(pos.x, pos.y, pos.z,
                                   transform.eulerAngles.y,
                                   GetComponent<Weapons.WeaponSystem>()?.CurrentWeaponId ?? "");
        }
    }
}
