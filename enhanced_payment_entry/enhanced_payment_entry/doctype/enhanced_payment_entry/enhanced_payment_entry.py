# Copyright (c) 2022, Infinity Systems and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe import *
from frappe.model.document import Document
from erpnext.accounts.general_ledger import make_gl_entries
from erpnext.controllers.accounts_controller import AccountsController, get_supplier_block_status, get_fiscal_years, get_accounting_dimensions, get_account_currency
from erpnext.accounts.party import get_party_account
import pandas as pd
from erpnext import get_company_currency
from frappe.utils import date_diff, add_months, today, getdate, add_days, flt, get_last_day

class EnhancedPaymentEntry(Document):
	def validate(self):
		pass

	def on_submit(self):
		if self.difference > 0.05:
			frappe.throw(_('Difference must be zero!'))
		
		if self.payment_request:
			r_amount = frappe.db.get_value('Enhanced Payment Request', self.payment_request, 'amount')
			rp_amount = frappe.db.get_value('Enhanced Payment Request', self.payment_request, 'paid_amount')
			rp_amount = rp_amount + self.amount
			if rp_amount > r_amount:
				frappe.throw(_("You can't exceed payment request amount!"))
			frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'paid_amount', rp_amount)
			if rp_amount == r_amount:
				frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'status', 'Paid')
				frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'paid_percent', 100)
			if rp_amount < r_amount:
				frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'status', 'Partially Paid')
				frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'paid_percent', rp_amount / r_amount * 100)
	
		self.create_gl()

	def on_cancel(self):
		self.ignore_linked_doctypes = ['GL Entry', "Payment Ledger Entry"]
		self.create_gl(cancel = 1)
		if self.payment_request:
			r_amount = frappe.db.get_value('Enhanced Payment Request', self.payment_request, 'amount')
			rp_amount = frappe.db.get_value('Enhanced Payment Request', self.payment_request, 'paid_amount')
			rp_amount = rp_amount - self.amount
			
			frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'paid_amount', rp_amount)
			if rp_amount == r_amount:
				frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'status', 'Paid')
				frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'paid_percent', 100)
			if rp_amount < r_amount:
				frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'status', 'Partially Paid')
				frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'paid_percent', rp_amount / r_amount * 100)
			if rp_amount == 0:
				frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'status', 'Pending')
				frappe.db.set_value('Enhanced Payment Request', self.payment_request, 'paid_percent', 0)
	
		
	def on_trash(self):
		# delete sl and gl entries on deletion of transaction
		if frappe.db.get_single_value("Accounts Settings", "delete_linked_ledger_entries"):
			frappe.db.sql(
				"delete from `tabGL Entry` where voucher_type=%s and voucher_no=%s", (self.doctype, self.name)
			)
			frappe.db.sql(
				"delete from `tabStock Ledger Entry` where voucher_type=%s and voucher_no=%s",
				(self.doctype, self.name),
			)
	
	def create_gl(self, cancel = 0):

		cc = get_company_currency(self.company)
		gl_map =[]
		if self.payment_type == 'Receive':
			gl_map.append(
				self.get_gl_dict({
						"voucher_type": self.doctype,
						"voucher_no": self.name,
						"account": self.account,
						"debit": self.amount if self.account_currency == cc else self.base_amount,
						"debit_in_account_currency": self.amount,
						"credit": 0,
						"reference_type": self.doctype,
						"reference_name": self.name,
						"remarks": self.get('remarks', None),
						"company": self.company,
						"posting_date": self.posting_date,
						"cost_center": self.get('cost_center', None),
						"account_currency": self.account_currency
					},
					item=self
				)
			)
			accounts = self.get('accounts')
			for account in accounts:
				gl_map.append(
					self.get_gl_dict({
							"voucher_type": self.doctype,
							"voucher_no": self.name,
							"account": account.account,
							"against": self.account,
							"credit": account.amount if account.account_currency == cc else account.base_amount,
							"credit_in_account_currency": account.amount,
							"debit": 0,
							"account_currency": account.account_currency,
							"reference_type": self.doctype,
							"reference_name": self.name,
							"remarks": account.description,
							"company": self.company,
							"posting_date": self.posting_date,
							"cost_center": account.cost_center,
							"party_type": account.party_type if account.party_type else None,
							"party": account.party if account.party else None,
							"project": account.get('project')
						},
						item=account
					)
				)

		if self.payment_type == 'Pay':
			accounts = self.get('accounts')
			for account in accounts:
				gl_map.append(
					self.get_gl_dict({
							"voucher_type": self.doctype,
							"voucher_no": self.name,
							"account": account.account,
							"against": self.account,
							"credit": 0,
							"debit": account.amount if account.account_currency == cc else account.base_amount,
							"debit_in_account_currency": account.amount,
							"account_currency": account.account_currency,
							"reference_type": self.doctype,
							"reference_name": self.name,
							"remarks": account.description,
							"company": self.company,
							"posting_date": self.posting_date,
							"cost_center": account.cost_center,
							"party_type": account.party_type if account.party_type else None,
							"party": account.party if account.party else None,
							"project": account.get('project')
						},
						item=account
					)
				)

			gl_map.append(
				self.get_gl_dict({
						"voucher_type": self.doctype,
						"voucher_no": self.name,
						"account": self.account,
						"debit": 0,
						"credit": self.amount if self.account_currency == cc else self.base_amount,
						"credit_in_account_currency": self.amount,
						"reference_type": self.doctype,
						"reference_name": self.name,
						"remarks": self.remarks,
						"company": self.company,
						"posting_date": self.posting_date,
						"cost_center": self.cost_center,
						"account_currency": self.account_currency,
					},
					item=self
				)
			)
			
		#frappe.errprint(gl_map)
		#from erpnext.accounts.general_ledger import make_gl_entries
		if gl_map:
			make_gl_entries(gl_map, cancel=cancel, adv_adj=0)
			if not cancel==1:
				frappe.msgprint(_('GL Entry Created Successfully'))

	
	def get_gl_dict(self, args, account_currency=None, item=None):
		"""this method populates the common properties of a gl entry record"""

		self.company_currency = get_company_currency(self.company)
		posting_date = args.get('posting_date') or self.get('posting_date')
		fiscal_years = get_fiscal_years(posting_date, company=self.company)
		if len(fiscal_years) > 1:
			frappe.throw(_("Multiple fiscal years exist for the date {0}. Please set company in Fiscal Year").format(
				posting_date))
		else:
			fiscal_year = fiscal_years[0][0]

		gl_dict = frappe._dict({
			'company': self.company,
			'posting_date': posting_date,
			'fiscal_year': fiscal_year,
			'voucher_type': self.doctype,
			'voucher_no': self.name,
			'remarks': self.get("remarks") or self.get("remark"),
			'debit': 0,
			'credit': 0,
			'debit_in_account_currency': 0,
			'credit_in_account_currency': 0,
			'is_opening': self.get("is_opening") or "No",
			'party_type': None,
			'party': None,
			'project': self.get("project")
		})

		accounting_dimensions = get_accounting_dimensions()
		dimension_dict = frappe._dict()

		for dimension in accounting_dimensions:
			dimension_dict[dimension] = self.get(dimension)
			if item and item.get(dimension):
				dimension_dict[dimension] = item.get(dimension)

		gl_dict.update(dimension_dict)
		gl_dict.update(args)

		if not account_currency:
			account_currency = get_account_currency(gl_dict.account)

		if gl_dict.account and self.doctype not in ["Enhanced Payment Entry"]:
			self.validate_account_currency(gl_dict.account, account_currency)
			set_balance_in_account_currency(gl_dict, account_currency, self.get("conversion_rate"),
											self.company_currency)

		return gl_dict

	def validate_account_currency(self, account, account_currency=None):
		valid_currency = [self.company_currency]
		if self.get("currency") and self.currency != self.company_currency:
			valid_currency.append(self.currency)

		if account_currency not in valid_currency:
			frappe.throw(_("Account {0} is invalid. Account Currency must be {1}")
						 .format(account, _(" or ").join(valid_currency)))


	@whitelist()
	def get_account_balance(self):
		return frappe.db.get_value('Account', self.account, 'account_currency')

def set_balance_in_account_currency(gl_dict, account_currency=None, conversion_rate=None, company_currency=None):
	if (not conversion_rate) and (account_currency != company_currency):
		frappe.throw(_("Account: {0} with currency: {1} can not be selected")
					 .format(gl_dict.account, account_currency))

	gl_dict["account_currency"] = company_currency if account_currency == company_currency \
		else account_currency

	# set debit/credit in account currency if not provided
	if flt(gl_dict.debit) and not flt(gl_dict.debit_in_account_currency):
		gl_dict.debit_in_account_currency = gl_dict.debit if account_currency == company_currency \
			else flt(gl_dict.debit / conversion_rate, 2)

	if flt(gl_dict.credit) and not flt(gl_dict.credit_in_account_currency):
		gl_dict.credit_in_account_currency = gl_dict.credit if account_currency == company_currency \
			else flt(gl_dict.credit / conversion_rate, 2)


