import unittest
from datetime import datetime, timezone

from order_utils import (
    order_total, vpn_selection, parse_vpn_start, can_change_status,
    vpn_expiry_iso, was_vpn_order_processed,
)


class OrderRulesTests(unittest.TestCase):
    def test_delivery_is_not_charged_twice(self):
        self.assertEqual(order_total({"total": 1250, "delivery": "Доставка", "delivery_cost": 250}), 1250)

    def test_free_delivery_and_discounts_preserve_checkout_total(self):
        self.assertEqual(order_total({"subtotal": 2500, "discount": 250, "total": 2250, "delivery": "Доставка"}), 2250)

    def test_legacy_total_is_supported(self):
        self.assertEqual(order_total({"Total summary": "1250"}), 1250)

    def test_invalid_amounts_are_rejected(self):
        for value in (-1, True, None, {}, float("nan"), "1e6", "500.5", 10**10):
            with self.subTest(value=value), self.assertRaises(ValueError):
                order_total({"total": value})

    def test_vpn_links_preserve_devices_and_old_links(self):
        self.assertEqual(parse_vpn_start("vpn_month_5"), ("month", 5))
        self.assertEqual(parse_vpn_start("vpn_trial"), ("trial", 1))

    def test_malformed_vpn_links_are_rejected(self):
        for payload in ("vpn_month_0", "vpn_month_100", "vpn_month_2_extra", "month_2", "vpn_month_a"):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                parse_vpn_start(payload)

    def test_vpn_price_matches_device_count(self):
        tariffs = {"month": {"price": 150, "devices": 1, "days": 30}}
        for devices, price in ((1, 150), (2, 225), (3, 300), (5, 450)):
            with self.subTest(devices=devices):
                selected = vpn_selection(tariffs, "month", devices)
                self.assertEqual((selected["devices"], selected["price"]), (devices, price))
        self.assertEqual(tariffs["month"]["price"], 150, "Базовый тариф не мутируется")

    def test_invalid_vpn_devices_are_rejected(self):
        for devices in (True, 0, 4, 100, [], "03"):
            with self.subTest(devices=devices), self.assertRaises(ValueError):
                vpn_selection({"month": {"price": 150}}, "month", devices)

    def test_statuses_move_forward_and_require_acceptance(self):
        self.assertTrue(can_change_status("new", "accept"))
        self.assertTrue(can_change_status("accept", "done"))
        self.assertTrue(can_change_status("ship", "cancel"))
        self.assertFalse(can_change_status("new", "done"))
        self.assertFalse(can_change_status("pack", "accept"))

    def test_repeated_and_terminal_statuses_are_rejected(self):
        for status in ("new", "accept", "pack", "ship", "done", "cancel"):
            self.assertFalse(can_change_status(status, status))
        self.assertFalse(can_change_status("done", "cancel"))
        self.assertFalse(can_change_status("cancel", "accept"))

    def test_vpn_expiry_has_magadan_timezone_and_same_instant(self):
        instant = datetime(2026, 9, 7, 20, 0, tzinfo=timezone.utc)
        stored = vpn_expiry_iso(instant.timestamp() * 1000)
        self.assertEqual(stored, "2026-09-08T07:00:00+11:00")
        self.assertEqual(datetime.fromisoformat(stored), instant)

    def test_old_vpn_order_cannot_be_granted_again_after_renewal(self):
        record = {"last_processed_order_id": "second", "processed_order_ids": ["first", "second"]}
        self.assertTrue(was_vpn_order_processed(record, "first"))
        self.assertTrue(was_vpn_order_processed(record, "second"))
        self.assertFalse(was_vpn_order_processed(record, "third"))
        self.assertTrue(was_vpn_order_processed({"last_processed_order_id": "old"}, "old"))


if __name__ == "__main__":
    unittest.main()
