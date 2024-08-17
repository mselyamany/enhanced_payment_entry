# Copyright (c) 2022, Infinity Systems and contributors
# For license information, please see license.txt

import frappe
import erpnext
from frappe.model.document import Document

class EnhancedPaymentRequest(Document):
	pass

@frappe.whitelist()
def make_epe(dn):
	if not dn:
		return

	epr = frappe.get_doc('Enhanced Payment Request', dn)
	epe = frappe.new_doc('Enhanced Payment Entry')
	epe.company = epr.company
	epe.payment_request = dn
	epe.payment_type = epr.payment_type
	epe.mode_of_payment = epr.mode_of_payment
	if 'branch' in epr.get_valid_dict() and 'branch' in epe.get_valid_dict():
		epe.branch = epr.branch
	if 'unit' in epr.get_valid_dict() and 'unit' in epe.get_valid_dict():
		epe.unit = epr.unit
	if 'project' in epr.get_valid_dict() and 'project' in epe.get_valid_dict():
		epe.project = epr.project
	epe.account = epr.account
	epe.account_currency = epr.account_currency
	epe.account_balance = erpnext.accounts.utils.get_balance_on(company = epr.company, account = epr.account)
	epe.amount = epr.amount - epr.paid_amount
	epe.remarks = epr.remarks
	epe.requested_by = epr.user_name
	cc = frappe.get_doc("Company", epr.company).default_currency
	epe.rate = erpnext.setup.utils.get_exchange_rate(from_currency = epr.account_currency, to_currency = cc)
	epe.base_amount = epr.amount * erpnext.setup.utils.get_exchange_rate(from_currency = epr.account_currency, to_currency = cc)



	return epe

