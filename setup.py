from setuptools import setup, find_packages

with open("requirements.txt") as f:
	install_requires = f.read().strip().split("\n")

# get version from __version__ variable in enhanced_payment_entry/__init__.py
from enhanced_payment_entry import __version__ as version

setup(
	name="enhanced_payment_entry",
	version=version,
	description="Enhanced Payment Entry",
	author="Infinity Systems",
	author_email="info@infintiysys.org",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
